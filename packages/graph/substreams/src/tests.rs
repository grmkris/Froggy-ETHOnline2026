use super::*;
use ethabi::ethereum_types::U256;

fn address(byte: u8) -> Vec<u8> {
    vec![byte; 20]
}
fn tx_hash() -> Vec<u8> {
    vec![99; 32]
}
fn block(logs: Vec<eth::Log>, calls: Vec<eth::Call>) -> eth::Block {
    eth::Block {
        number: 42,
        hash: vec![42; 32],
        transaction_traces: vec![eth::TransactionTrace {
            hash: tx_hash(),
            from: address(9),
            status: 1,
            calls,
            receipt: Some(eth::TransactionReceipt {
                logs,
                ..Default::default()
            }),
            ..Default::default()
        }],
        ..Default::default()
    }
}
fn transfer(from: u8, to: u8, amount: &str, index: u32) -> erc20::Log {
    erc20::Log {
        address: address(4),
        ordinal: index as u64,
        topics: vec![vec![0; 32]; 3],
        data: vec![0; 32],
        log: Some(erc20::log::Log::Transfer(erc20::Transfer {
            from: address(from),
            to: address(to),
            amount: amount.into(),
        })),
        ..Default::default()
    }
}
fn tokens(logs: Vec<erc20::Log>) -> erc20::Events {
    erc20::Events {
        transactions: vec![erc20::Transaction {
            hash: tx_hash(),
            from: address(9),
            logs,
            ..Default::default()
        }],
    }
}
fn run(
    params: String,
    block: eth::Block,
    tokens: erc20::Events,
    native: native::Events,
) -> BlockActivity {
    extract_wallet_activity(params, block, tokens, native).unwrap()
}
fn source(key: &str, contract: u8, pool: Option<&str>) -> serde_json::Value {
    serde_json::json!({"key":key,"contract":addr(&address(contract)),"poolId":pool})
}
fn log(contract: u8, pool: Option<u8>) -> eth::Log {
    eth::Log {
        address: address(contract),
        topics: pool
            .map(|v| vec![vec![77; 32], vec![v; 32]])
            .unwrap_or_default(),
        ..Default::default()
    }
}
#[test]
fn parameters_keep_legacy_and_bound_distinct_keys_and_subscriptions() {
    assert!(parameters("oops").is_err());
    assert!(parameters("").unwrap().addresses.is_empty());
    assert_eq!(
        parameters(
            "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        )
        .unwrap()
        .addresses
        .len(),
        1
    );
    let valid = serde_json::json!({"priceSources":(0..100).map(|i|source(&format!("key{}",i%20),i,None)).collect::<Vec<_>>()});
    assert_eq!(
        parameters(&valid.to_string()).unwrap().price_sources.len(),
        100
    );
    let too_many_keys = serde_json::json!({"priceSources":(0..21).map(|i|source(&format!("key{i}"),i,None)).collect::<Vec<_>>()});
    assert!(parameters(&too_many_keys.to_string()).is_err());
    let too_many_sources = serde_json::json!({"priceSources":(0..101).map(|i|source("one",i,None)).collect::<Vec<_>>()});
    assert!(parameters(&too_many_sources.to_string()).is_err());
    assert!(parameters(r#"{"priceSources":[{"key":"bad\nkey","contract":"0x1111111111111111111111111111111111111111","poolId":null}]}"#).is_err());
}
#[test]
fn amounts_keep_integer_precision() {
    assert!(positive("340282366920938463463374607431768211457"));
    for value in ["0", "000", "-1", "1.5", "1e6", ""] {
        assert!(!positive(value));
    }
}
#[test]
fn progress_and_price_changes_do_not_need_a_watched_wallet() {
    let params=serde_json::json!({"addresses":[],"priceSources":[source("price",4,None),source("price",5,None)]}).to_string();
    let out = run(
        params,
        block(vec![log(4, None), log(4, None), log(5, None)], vec![]),
        erc20::Events::default(),
        native::Events::default(),
    );
    assert_eq!(out.changed_sources, vec!["price"]);
    assert!(out.transactions.is_empty());
    assert_eq!(out.number, 42);
    let empty = run(
        String::new(),
        block(vec![], vec![]),
        erc20::Events::default(),
        native::Events::default(),
    );
    assert_eq!(empty.v, 1);
    assert!(empty.changed_sources.is_empty());
    assert!(empty.transactions.is_empty());
}
#[test]
fn source_contract_pool_id_and_failed_transactions_are_checked() {
    let pool = addr(&vec![7; 32]);
    let params=serde_json::json!({"priceSources":[source("matching",4,Some(&pool)),source("wrong-pool",4,Some(&addr(&vec![8;32]))),source("wrong-contract",5,Some(&pool))]}).to_string();
    let out = run(
        params.clone(),
        block(vec![log(4, Some(7))], vec![]),
        erc20::Events::default(),
        native::Events::default(),
    );
    assert_eq!(out.changed_sources, vec!["matching"]);
    let mut failed = block(vec![log(4, Some(7))], vec![]);
    failed.transaction_traces[0].status = 2;
    assert!(run(
        params,
        failed,
        erc20::Events::default(),
        native::Events::default()
    )
    .changed_sources
    .is_empty());
}
#[test]
fn inbound_router_transfer_keeps_route_evidence_and_excludes_nfts_and_zeroes() {
    let mut nft = transfer(2, 1, "999", 3);
    nft.topics.push(vec![0; 32]);
    let out = run(
        addr(&address(1)),
        block(vec![], vec![]),
        tokens(vec![
            transfer(2, 3, "50", 1),
            transfer(3, 1, "49", 2),
            nft,
            transfer(2, 1, "0", 4),
        ]),
        native::Events::default(),
    );
    assert_eq!(out.transactions.len(), 1);
    let tx = &out.transactions[0];
    assert_eq!(tx.wallet, addr(&address(1)));
    assert_eq!(tx.transaction_from, addr(&address(9)));
    assert_eq!(tx.transfers.len(), 2);
    assert_eq!(tx.transfers[0].from, addr(&address(2)));
    assert_eq!(tx.transfers[1].amount, "49");
}
#[test]
fn failed_transaction_and_reverted_erc20_call_never_create_wallet_activity() {
    let mut failed = block(vec![], vec![]);
    failed.transaction_traces[0].status = 2;
    assert!(run(
        addr(&address(1)),
        failed,
        tokens(vec![transfer(2, 1, "3", 1)]),
        native::Events::default()
    )
    .transactions
    .is_empty());
    let mut event = transfer(2, 1, "3", 1);
    event.call = Some(erc20::Call {
        index: 1,
        ..Default::default()
    });
    let reverted = eth::Call {
        index: 1,
        state_reverted: true,
        ..Default::default()
    };
    assert!(run(
        addr(&address(1)),
        block(vec![], vec![reverted]),
        tokens(vec![event]),
        native::Events::default()
    )
    .transactions
    .is_empty());
}
#[test]
fn native_value_counts_root_once_and_rejects_delegate_and_reverted_calls() {
    let raw_calls = vec![
        eth::Call {
            index: 0,
            depth: 0,
            call_type: 1,
            ..Default::default()
        },
        eth::Call {
            index: 1,
            depth: 1,
            call_type: 1,
            ..Default::default()
        },
        eth::Call {
            index: 2,
            depth: 1,
            call_type: 3,
            ..Default::default()
        },
        eth::Call {
            index: 3,
            depth: 2,
            call_type: 1,
            state_reverted: true,
            ..Default::default()
        },
    ];
    let native = native::Events {
        transactions: vec![native::Transaction {
            hash: tx_hash(),
            from: address(1),
            to: Some(address(2)),
            value: "10".into(),
            calls: (0..4)
                .map(|index| native::Call {
                    index,
                    caller: address(2),
                    address: address(1),
                    value: "3".into(),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        }],
        ..Default::default()
    };
    let out = run(
        addr(&address(1)),
        block(vec![], raw_calls),
        erc20::Events::default(),
        native,
    );
    assert_eq!(out.transactions.len(), 1);
    assert_eq!(out.transactions[0].transfers.len(), 2);
    assert_eq!(out.transactions[0].transfers[0].amount, "10");
    assert_eq!(out.transactions[0].transfers[1].amount, "3");
}
fn curve_log(side: &str) -> eth::Log {
    use ParamType::{Address as A, Uint as U};
    let event = named_event(
        if side == "buy" {
            "CurveBuy"
        } else {
            "CurveSell"
        },
        vec![
            ("actor", A, true),
            ("recipient", A, true),
            ("in", U(256), false),
            ("out", U(256), false),
            ("fee", U(256), false),
            ("tax", U(256), false),
        ],
    );
    let topic = |v| {
        let mut bytes = vec![0; 12];
        bytes.extend(address(v));
        bytes
    };
    eth::Log {
        address: address(5),
        topics: vec![event.signature().as_bytes().to_vec(), topic(1), topic(1)],
        data: ethabi::encode(&[
            Token::Uint(U256::from(10)),
            Token::Uint(U256::from(20)),
            Token::Uint(U256::from(1)),
            Token::Uint(U256::from(2)),
        ]),
        ordinal: 10,
        block_index: 3,
        ..Default::default()
    }
}
#[test]
fn curve_buy_and_sell_are_candidates_with_actual_actor_not_outer_sender() {
    for side in ["buy", "sell"] {
        let event = curve_log(side);
        let call = eth::Call {
            index: 2,
            depth: 1,
            call_type: 1,
            begin_ordinal: 8,
            end_ordinal: 12,
            logs: vec![event.clone()],
            ..Default::default()
        };
        let out = run(
            addr(&address(1)),
            block(vec![event], vec![call]),
            tokens(vec![transfer(5, 1, "20", 11)]),
            native::Events::default(),
        );
        let row = &out.transactions[0];
        assert_eq!(row.transaction_from, addr(&address(9)));
        assert_eq!(row.curves_pons.len(), 1);
        let curve = &row.curves_pons[0];
        assert_eq!(curve.side, side);
        assert_eq!(curve.actor, addr(&address(1)));
        assert_eq!(curve.amount_in, "10");
        assert_eq!(curve.amount_out, "20");
        assert_eq!(curve.fee, "1");
        assert_eq!(curve.tax, "2");
        assert_eq!(curve.location.as_ref().unwrap().call_index, 2);
    }
}
#[test]
fn receipt_only_curve_events_remain_explicitly_without_call_scope() {
    let out = run(
        addr(&address(1)),
        block(vec![curve_log("buy")], vec![]),
        tokens(vec![transfer(5, 1, "20", 11)]),
        native::Events::default(),
    );
    assert_eq!(
        out.transactions[0].curves_pons[0]
            .location
            .as_ref()
            .unwrap()
            .end_ordinal,
        0
    );
}
#[test]
fn plain_transfers_do_not_invent_swaps_and_large_route_is_marked_truncated() {
    let out = run(
        addr(&address(1)),
        block(vec![], vec![]),
        tokens((0..201).map(|i| transfer(2, 1, "1", i)).collect()),
        native::Events::default(),
    );
    let tx = &out.transactions[0];
    assert!(tx.truncated);
    assert_eq!(tx.transfers.len(), 200);
    assert!(tx.curves_pons.is_empty());
    assert!(tx.swaps_v2.is_empty());
    assert!(tx.swaps_v3.is_empty());
}

#[test]
fn routed_multihop_swap_logs_stay_with_one_wallet_transaction() {
    use ParamType::{Address as A, Uint as U};
    let event = named_event(
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
    let topic = |v| {
        let mut bytes = vec![0; 12];
        bytes.extend(address(v));
        bytes
    };
    let logs: Vec<_> = (5..7)
        .map(|pool| eth::Log {
            address: address(pool),
            topics: vec![
                event.signature().as_bytes().to_vec(),
                topic(2),
                topic(if pool == 5 { 6 } else { 1 }),
            ],
            data: ethabi::encode(&[
                Token::Uint(U256::from(10)),
                Token::Uint(U256::zero()),
                Token::Uint(U256::zero()),
                Token::Uint(U256::from(9)),
            ]),
            ordinal: pool as u64,
            block_index: pool as u32,
            ..Default::default()
        })
        .collect();
    let call = eth::Call {
        index: 1,
        depth: 1,
        call_type: 1,
        begin_ordinal: 1,
        end_ordinal: 20,
        logs: logs.clone(),
        ..Default::default()
    };
    let out = run(
        addr(&address(1)),
        block(logs, vec![call]),
        tokens(vec![
            transfer(1, 2, "10", 1),
            transfer(2, 5, "10", 2),
            transfer(5, 6, "9", 3),
            transfer(6, 1, "8", 4),
        ]),
        native::Events::default(),
    );
    assert_eq!(out.transactions.len(), 1);
    let row = &out.transactions[0];
    assert_eq!(row.transfers.len(), 4);
    assert_eq!(row.swaps_v2.len(), 2);
    assert_eq!(row.swaps_v2[0].sender, addr(&address(2)));
    assert_eq!(row.swaps_v2[1].recipient, addr(&address(1)));
    assert_eq!(row.swaps_v2[1].location.as_ref().unwrap().end_ordinal, 20);
}
