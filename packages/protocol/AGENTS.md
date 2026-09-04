# packages/protocol

Both wire protocols and the screencast frame envelope. Every message carries an explicit `v` and is decoded before use — including the three-number frame header, where a hand-written check would have been shorter but a malformed header produces a zero-width canvas that reads as "the screencast is broken".

The two sockets are separate because they have opposite shapes: the browser socket is a firehose where the newest frame supersedes every earlier one, and the app socket is a low-rate stream where every message matters. A freeze acknowledgement must not queue behind a backlog of JPEGs.
