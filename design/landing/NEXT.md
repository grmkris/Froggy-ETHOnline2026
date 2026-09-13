# Deferred follow-on work

The approved implementation covers the landing entry step, the five-step visual preview, and three short promos. It does not replace the existing post-sign-in onboarding or produce the longer presentation film.

## Full-screen onboarding redesign

Reuse the generated setup kit in a sequence of large, focused screens: balance, email, Telegram, coding agent, and chat/MCP. Each screen should have one primary action, a clear skip when optional, a progress indicator, and a recoverable connection/error state. Explain credits and wallet funding separately. Reuse existing funding, signer-grant, email, Telegram and OAuth components; do not introduce new spending-authority paths.

Before changing the existing four-step flow, settle which steps are required and how its persisted completion state maps to the five-screen sequence. The landing preview currently describes the intended setup capabilities without changing that persistence contract.

## Separate presentation video

HyperFrames can also make the longer presentation from the same local assets. A useful structure is: the problem with disconnected agents; Froggy's shared workspace; a browser task and human takeover; credits versus wallet authority; research and a reviewed trade; watchlists, email and Telegram; external-agent connection; closing product argument. Use fresh labelled captures or recorded live evidence for each claim. Keep presentation narration and pacing separate from the silent 20-second landing films.

If a navigable presentation is needed instead of an MP4, use the HyperFrames slideshow workflow with presenter notes and discrete slides. A narrated presentation MP4 belongs in the general/product video workflow.
