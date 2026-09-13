# 0039 — An address is one saved item; chains are discovered facts

A saved wallet or token is identified by its address, compared case-insensitively, across every chain. Its wallet/token tag and observed chains are facts recorded by discovery, not a chain choice at save time. Migration 0029 merges legacy per-chain rows, retaining an active watch where present, repointing its history and assigning explicit watch coverage. Legacy JSON still decodes; new writes omit the old source network.

Saving is instant and free. Discovery reads each configured RPC at one pinned block, records absent and unavailable results honestly, and changes the placeholder name only while the person has not edited it. Testnets appear only when no mainnet was observed. A completed check does not run again simply because the item is opened; Check again is explicit. Discovery shares per-owner concurrency and rate limits across web and agent calls.

A watch covers every supported chain where the address was found, with separate start blocks. An agent may name a chain to restrict coverage; omission never defaults to Base. Paid snapshots wait for discovery and use a supported observed chain accepted by the catalogue. Existing paid results are imported by address, preserving the actual provider network in the observation.

Activity deduplication includes the network as well as owner, item and transaction hash (migration 0030), since one signed transaction can appear on more than one chain. Saving the address once must not discard either event.

This supersedes the per-chain identity in decisions 0029 and 0034. The presentation work adds one paste/search bar, presence chips and a Notify me control; free saving stays separate from explicitly priced searches and refreshes.
