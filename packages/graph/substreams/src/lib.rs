use ethabi::{Event, EventParam, ParamType, RawLog, Token};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use substreams::{errors::Error, scalar::BigInt};
use substreams_ethereum::pb::eth::v2 as eth;
mod erc20 {
    include!(concat!(env!("OUT_DIR"), "/erc20.transfers.v1.rs"));
}
mod native {
    include!(concat!(env!("OUT_DIR"), "/native.transfers.v1.rs"));
}
mod pb {
    include!(concat!(env!("OUT_DIR"), "/froggy.wallet.v1.rs"));
}
use pb::*;
const MAX_TRANSACTIONS: usize = 200;
const MAX_EVIDENCE: usize = 200;
fn addr(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}
fn positive(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|c| c.is_ascii_digit())
        && value.bytes().any(|c| c != b'0')
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Parameters {
    #[serde(default)]
    addresses: BTreeSet<String>,
    #[serde(default)]
    price_sources: Vec<PriceSource>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PriceSource {
    key: String,
    contract: String,
    pool_id: Option<String>,
}
fn valid_hex(value: &str, bytes: usize) -> bool {
    value.len() == 2 + bytes * 2 && value.starts_with("0x") && hex::decode(&value[2..]).is_ok()
}
fn parameters(params: &str) -> Result<Parameters, Error> {
    if params.len() > 40_000 {
        return Err(Error::msg("Wallet activity parameters exceed their bound"));
    }
    let mut parsed = if params.trim_start().starts_with('{') {
        serde_json::from_str::<Parameters>(params)
            .map_err(|_| Error::msg("Invalid wallet activity parameters"))?
    } else {
        Parameters {
            addresses: params
                .split(',')
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect(),
            ..Default::default()
        }
    };
    parsed.addresses = parsed
        .addresses
        .into_iter()
        .map(|s| s.to_lowercase())
        .collect();
    if parsed.addresses.len() > 20 || parsed.addresses.iter().any(|s| !valid_hex(s, 20)) {
        return Err(Error::msg("Expected at most twenty EVM wallet addresses"));
    }
    if parsed.price_sources.len() > 100
        || parsed
            .price_sources
            .iter()
            .map(|s| &s.key)
            .collect::<BTreeSet<_>>()
            .len()
            > 20
    {
        return Err(Error::msg(
            "Expected at most twenty price keys and one hundred subscriptions",
        ));
    }
    for source in &mut parsed.price_sources {
        source.contract = source.contract.to_lowercase();
        source.pool_id = source.pool_id.as_ref().map(|id| id.to_lowercase());
        if source.key.is_empty()
            || source.key.len() > 200
            || !source
                .key
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b":_./-".contains(&c))
            || !valid_hex(&source.contract, 20)
            || source.pool_id.as_ref().is_some_and(|id| !valid_hex(id, 32))
        {
            return Err(Error::msg("Invalid price subscription"));
        }
    }
    Ok(parsed)
}
fn successful(call: &eth::Call) -> bool {
    !call.status_failed && !call.status_reverted && !call.state_reverted
}
fn matching_sources(
    sources: &[PriceSource],
    tx: &eth::TransactionTrace,
    changed: &mut BTreeSet<String>,
) {
    // Receipt logs are canonical successful effects, including chains without traces.
    for log in tx.receipt.as_ref().into_iter().flat_map(|r| &r.logs) {
        for source in sources {
            if source.contract != addr(&log.address) {
                continue;
            }
            if source.pool_id.as_ref().is_some_and(|id| {
                log.topics
                    .get(1)
                    .is_none_or(|topic| topic.len() != 32 || addr(topic) != *id)
            }) {
                continue;
            }
            changed.insert(source.key.clone());
        }
    }
}
fn add_transfer(
    book: &mut BTreeMap<(String, String), WalletTransaction>,
    watched: &BTreeSet<String>,
    hash: &[u8],
    sender: &[u8],
    transfer: Transfer,
    truncated: &mut bool,
    all: &mut BTreeMap<String, Vec<Transfer>>,
) {
    if !positive(&transfer.amount) || transfer.from == transfer.to {
        return;
    }
    let evidence = all.entry(addr(hash)).or_default();
    if evidence.len() <= MAX_EVIDENCE {
        evidence.push(transfer.clone());
    }
    for wallet in [&transfer.from, &transfer.to] {
        if !watched.contains(wallet) {
            continue;
        }
        let key = (wallet.clone(), addr(hash));
        if !book.contains_key(&key) && book.len() >= MAX_TRANSACTIONS {
            *truncated = true;
            continue;
        }
        let row = book.entry(key).or_insert_with(|| WalletTransaction {
            wallet: wallet.clone(),
            hash: addr(hash),
            transaction_from: addr(sender),
            ..Default::default()
        });
        if row.transfers.len() >= MAX_EVIDENCE {
            row.truncated = true;
            continue;
        }
        row.transfers.push(transfer.clone());
    }
}
fn named_event(name: &str, fields: Vec<(&str, ParamType, bool)>) -> Event {
    Event {
        name: name.into(),
        anonymous: false,
        inputs: fields
            .into_iter()
            .map(|(name, kind, indexed)| EventParam {
                name: name.into(),
                kind,
                indexed,
            })
            .collect(),
    }
}
fn text(token: &Token) -> String {
    match token {
        Token::Address(v) => addr(v.as_bytes()),
        Token::Uint(v) => v.to_string(),
        Token::Int(v) => {
            let mut bytes = [0u8; 32];
            v.to_big_endian(&mut bytes);
            BigInt::from_signed_bytes_be(&bytes).to_string()
        }
        Token::FixedBytes(v) => addr(v),
        _ => String::new(),
    }
}
fn decode(event: &Event, log: &eth::Log) -> Option<Vec<String>> {
    if log.topics.first()?.as_slice() != event.signature().as_bytes()
        || log.topics.iter().any(|t| t.len() != 32)
    {
        return None;
    }
    event
        .parse_log(RawLog {
            topics: log
                .topics
                .iter()
                .map(|t| ethabi::ethereum_types::H256::from_slice(t))
                .collect(),
            data: log.data.clone(),
        })
        .ok()
        .map(|l| l.params.iter().map(|p| text(&p.value)).collect())
}

#[substreams::handlers::map]
pub fn map_wallet_activity(
    params: String,
    block: eth::Block,
    tokens: erc20::Events,
    native: native::Events,
) -> Result<BlockActivity, Error> {
    extract_wallet_activity(params, block, tokens, native)
}
fn extract_wallet_activity(
    params: String,
    block: eth::Block,
    tokens: erc20::Events,
    native: native::Events,
) -> Result<BlockActivity, Error> {
    let params = parameters(&params)?;
    let watched = params.addresses;
    let successful_txs: BTreeMap<_, _> = block
        .transactions()
        .map(|tx| (tx.hash.clone(), tx))
        .collect();
    let mut changed = BTreeSet::new();
    for tx in successful_txs.values() {
        matching_sources(&params.price_sources, tx, &mut changed);
    }
    let mut out = BlockActivity {
        v: 1,
        number: block.number,
        hash: addr(&block.hash),
        timestamp: block
            .header
            .as_ref()
            .and_then(|h| h.timestamp.as_ref())
            .map(|t| t.seconds)
            .unwrap_or_default(),
        extended: block.detail_level == 0,
        ..Default::default()
    };
    let mut book = BTreeMap::new();
    let mut all = BTreeMap::new();
    if !watched.is_empty() {
        for tx in tokens.transactions {
            let Some(raw_tx) = successful_txs.get(&tx.hash) else {
                continue;
            };
            for log in tx.logs {
                if log.call.as_ref().is_some_and(|c| {
                    raw_tx
                        .calls
                        .iter()
                        .find(|raw| raw.index == c.index)
                        .is_none_or(|raw| !successful(raw))
                }) {
                    continue;
                }
                if let Some(erc20::log::Log::Transfer(t)) = log.log {
                    // ERC721 shares the event name; its indexed token ID is not an ERC20 amount.
                    if log.topics.len() != 3 || log.data.len() != 32 {
                        continue;
                    }
                    add_transfer(
                        &mut book,
                        &watched,
                        &tx.hash,
                        &tx.from,
                        Transfer {
                            asset: addr(&log.address),
                            from: addr(&t.from),
                            to: addr(&t.to),
                            amount: t.amount,
                            ordinal: log.ordinal,
                            call_index: log.call.as_ref().map(|c| c.index).unwrap_or_default(),
                            call_known: log.call.is_some(),
                            log_index: block
                                .transaction_traces
                                .iter()
                                .find(|t| t.hash == tx.hash)
                                .and_then(|t| t.receipt.as_ref())
                                .and_then(|r| r.logs.iter().find(|l| l.ordinal == log.ordinal))
                                .map(|l| l.block_index)
                                .unwrap_or_default(),
                        },
                        &mut out.truncated,
                        &mut all,
                    );
                }
            }
        }
        for tx in native.transactions {
            let Some(raw_tx) = successful_txs.get(&tx.hash) else {
                continue;
            };
            if let Some(to) = tx.to {
                add_transfer(
                    &mut book,
                    &watched,
                    &tx.hash,
                    &tx.from,
                    Transfer {
                        asset: "native".into(),
                        from: addr(&tx.from),
                        to: addr(&to),
                        amount: tx.value,
                        call_known: true,
                        ..Default::default()
                    },
                    &mut out.truncated,
                    &mut all,
                );
            }
            for call in tx.calls {
                let Some(raw_call) = raw_tx.calls.iter().find(|raw| raw.index == call.index) else {
                    continue;
                };
                if !successful(raw_call)
                    || raw_call.depth == 0
                    || !matches!(raw_call.call_type, 1 | 5)
                {
                    continue;
                }
                add_transfer(
                    &mut book,
                    &watched,
                    &tx.hash,
                    &tx.from,
                    Transfer {
                        asset: "native".into(),
                        from: addr(&call.caller),
                        to: addr(&call.address),
                        amount: call.value,
                        ordinal: call.begin_ordinal,
                        call_index: call.index,
                        call_known: true,
                        ..Default::default()
                    },
                    &mut out.truncated,
                    &mut all,
                );
            }
        }
    }
    use ParamType::{Address as A, FixedBytes as B, Int as I, Uint as U};
    // Layouts verified against the publishers' interfaces; see README sources.
    let v2 = named_event(
        "Swap",
        vec![
            ("sender", A, true),
            ("amount0In", U(256), false),
            ("amount1In", U(256), false),
            ("amount0Out", U(256), false),
            ("amount1Out", U(256), false),
            ("to", A, true),
        ],
    );
    let aero = named_event(
        "Swap",
        vec![
            ("sender", A, true),
            ("to", A, true),
            ("amount0In", U(256), false),
            ("amount1In", U(256), false),
            ("amount0Out", U(256), false),
            ("amount1Out", U(256), false),
        ],
    );
    let v3 = named_event(
        "Swap",
        vec![
            ("sender", A, true),
            ("recipient", A, true),
            ("amount0", I(256), false),
            ("amount1", I(256), false),
            ("sqrtPriceX96", U(160), false),
            ("liquidity", U(128), false),
            ("tick", I(24), false),
        ],
    );
    let v4 = named_event(
        "Swap",
        vec![
            ("id", B(32), true),
            ("sender", A, true),
            ("amount0", I(128), false),
            ("amount1", I(128), false),
            ("sqrtPriceX96", U(160), false),
            ("liquidity", U(128), false),
            ("tick", I(24), false),
            ("fee", U(24), false),
        ],
    );
    let curve_buy = named_event(
        "CurveBuy",
        vec![
            ("buyer", A, true),
            ("recipient", A, true),
            ("quoteIn", U(256), false),
            ("tokensOut", U(256), false),
            ("fee", U(256), false),
            ("tax", U(256), false),
        ],
    );
    let curve_sell = named_event(
        "CurveSell",
        vec![
            ("seller", A, true),
            ("recipient", A, true),
            ("tokensIn", U(256), false),
            ("quoteOut", U(256), false),
            ("fee", U(256), false),
            ("tax", U(256), false),
        ],
    );
    for tx in block.transactions() {
        let hash = addr(&tx.hash);
        let rows: Vec<_> = book.values_mut().filter(|row| row.hash == hash).collect();
        if rows.is_empty() {
            continue;
        }
        let mut evidence = WalletTransaction::default();
        let logs: Vec<(&eth::Log, Option<&eth::Call>)> = if tx.calls.is_empty() {
            tx.receipt
                .as_ref()
                .into_iter()
                .flat_map(|r| &r.logs)
                .map(|log| (log, None))
                .collect()
        } else {
            tx.logs_with_calls()
                .filter(|(_, call)| successful(call.call))
                .map(|(log, call)| (log, Some(call.call)))
                .collect()
        };
        for (log, call) in logs {
            let count = evidence.swaps_v2.len()
                + evidence.swaps_v3.len()
                + evidence.swaps_v4.len()
                + evidence.swaps_aerodrome.len()
                + evidence.curves_pons.len();
            if count >= MAX_EVIDENCE {
                evidence.truncated = true;
                break;
            }
            let location = Some(SwapLocation {
                contract: addr(&log.address),
                log_index: log.block_index,
                call_index: call.map(|c| c.index).unwrap_or_default(),
                begin_ordinal: call.map(|c| c.begin_ordinal).unwrap_or_default(),
                end_ordinal: call.map(|c| c.end_ordinal).unwrap_or_default(),
            });
            let curve = decode(&curve_buy, log)
                .map(|p| ("buy", p))
                .or_else(|| decode(&curve_sell, log).map(|p| ("sell", p)));
            if let Some((side, p)) = curve {
                evidence.curves_pons.push(CurvePons {
                    location,
                    side: side.into(),
                    actor: p[0].clone(),
                    recipient: p[1].clone(),
                    amount_in: p[2].clone(),
                    amount_out: p[3].clone(),
                    fee: p[4].clone(),
                    tax: p[5].clone(),
                });
            } else if let Some(p) = decode(&v2, log) {
                evidence.swaps_v2.push(SwapV2 {
                    location,
                    sender: p[0].clone(),
                    recipient: p[5].clone(),
                    amount0_in: p[1].clone(),
                    amount1_in: p[2].clone(),
                    amount0_out: p[3].clone(),
                    amount1_out: p[4].clone(),
                });
            } else if let Some(p) = decode(&aero, log) {
                evidence.swaps_aerodrome.push(SwapAerodrome {
                    location,
                    sender: p[0].clone(),
                    recipient: p[1].clone(),
                    amount0_in: p[2].clone(),
                    amount1_in: p[3].clone(),
                    amount0_out: p[4].clone(),
                    amount1_out: p[5].clone(),
                });
            } else if let Some(p) = decode(&v3, log) {
                evidence.swaps_v3.push(SwapV3 {
                    location,
                    sender: p[0].clone(),
                    recipient: p[1].clone(),
                    amount0: p[2].clone(),
                    amount1: p[3].clone(),
                    sqrt_price_x96: p[4].clone(),
                    liquidity: p[5].clone(),
                    tick: p[6].clone(),
                });
            } else if let Some(p) = decode(&v4, log) {
                evidence.swaps_v4.push(SwapV4 {
                    location,
                    pool_id: p[0].clone(),
                    sender: p[1].clone(),
                    amount0: p[2].clone(),
                    amount1: p[3].clone(),
                    sqrt_price_x96: p[4].clone(),
                    liquidity: p[5].clone(),
                    tick: p[6].clone(),
                    fee: p[7].clone(),
                });
            }
        }
        for row in rows {
            row.swaps_v2 = evidence.swaps_v2.clone();
            row.swaps_v3 = evidence.swaps_v3.clone();
            row.swaps_v4 = evidence.swaps_v4.clone();
            row.swaps_aerodrome = evidence.swaps_aerodrome.clone();
            row.curves_pons = evidence.curves_pons.clone();
            row.truncated |= evidence.truncated;
        }
    }
    for row in book.values_mut() {
        if let Some(flows) = all.get(&row.hash) {
            row.truncated |= flows.len() > MAX_EVIDENCE;
            row.transfers = flows.iter().take(MAX_EVIDENCE).cloned().collect();
        }
    }
    out.transactions = book.into_values().collect();
    out.changed_sources = changed.into_iter().collect();
    Ok(out)
}

#[cfg(test)]
mod tests;
