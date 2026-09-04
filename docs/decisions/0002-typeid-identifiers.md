# 0002 — TypeID entity identifiers

Status: accepted on 2026-09-04.

Every entity identifier is a TypeID: a prefixed, UUIDv7-backed, lexicographically sortable string such as `rom_01m1pg0264fvjscv3k6a2nxb0h`. Identifiers are declared once in `packages/domain/src/id.ts` with `makeIdSchema(prefix, brand)`, which returns a validating Effect `Schema` whose decoded type is a branded template literal, along with the synchronous `generate`, `is`, `fromUuid`, and `toUuid` companions the non-Effect seams need.

One declaration therefore produces the wire codec, the type-level brand, the database default, and the UUID conversion. A room identifier cannot be passed where a client identifier is expected, a malformed identifier fails protocol decoding with a 400-shaped error rather than reaching the driver, and `packages/database/src/columns.ts` stores the underlying UUID in a native `uuid` column so ordering and index size match a plain UUID key.

`makeIdSchema` refuses at import time to register a prefix another identifier already claimed. Prefix collisions are the failure mode that makes a branded identifier silently useless, and a registry that is only checked in review will eventually miss one.

The runtime dependency is `typeid-js`, which owns the base32 encoding and nothing else. An Effect-coupled TypeID library was evaluated first and rejected: it broke against the Effect version this repository pins, which is exactly the coupling a starter should not inherit for something as load-bearing as identifier decoding.

`packages/game-core` may not import the domain, so `createSimulation<Id>()` is generic over the identifier type and defaults to `string`. The simulation stays free of domain knowledge while the server still gets `ClientId` end to end.
