# Stable onboarding — 8 September 2026

## Findings and changes

The chat welcome screen was conditional on the entire activity stream being empty. When receipt history arrived after page load, it replaced the welcome screen even if the person had only copied the agent instructions. The welcome screen now remains until the person starts a conversation or explicitly opens the shared browser. Explicit browser visibility lives with the workspace and survives page navigation. Historical receipts remain available in Wallet and in the conversation once a turn starts.

The copy action stays available while agent status loads, after an agent connects, and if connection status fails. The welcome page places it before the task suggestions. Copying shows a pending indicator without changing the button's layout; the instruction/confirmation area reserves its height. Clipboard denial retains the manual-copy fallback. Connection failures have a retry action.

Loading wallet balances, receipt history and funding details use labeled skeletons. Initial loading no longer appears as an unavailable total or an empty activity history. A known unavailable balance still says unavailable. Activity loading failures expose a retry while retaining any receipts already available. The sign-in card keeps its explanation and dimensions while the sign-in action loads, and waits for identity readiness before showing that action.

## Verification

Validation uses the deployed release source plus only the 15 onboarding source/test files in `.froggy/onboarding-review`. The shared checkout contains unfinished trading work that is outside this fix. Production source hashes were compared with the release baseline: all 458 deployed source/manifests matched, including the intervening configuration redeploy.

The production build passed. Every stage of the full repository code gate passed, including formatting, type-aware lint, types, boundaries, agent-file checks, unit tests and dead-code detection. Lint ran with `--threads=2` after an unconstrained gate process was terminated with SIGTERM on the heavily loaded shared machine; no lint rules were changed.

New browser cases cover delayed historical receipts after copying, clipboard progress, connection loading and retry, delayed wallet/activity/funding responses, reduced motion, and explicit browser visibility across navigation. The delayed-receipt scenario passed after its assertion was corrected to check the amount displayed by compact receipts. Layout assertions measure layout dimensions separately from the existing button hover animation.

Desktop and mobile screenshots were inspected, including the final mobile wallet skeleton. The wallet reserves the balance caption and breakdown footer during loading; a browser assertion confirms that Activity stays in the same position when the data arrives.

The full browser run finished with 116 passed and one failed assertion: the new delayed-receipt test initially expected a purpose string that compact receipts do not display. The corrected scenario passed separately, checking the displayed amount, the welcome screen after copying, explicit browser navigation, and starting a conversation. After the final wallet layout adjustment, all 10 wallet onboarding tests passed again. Every one of the 117 scenarios therefore has a passing result; the original full-suite invocation itself was not green.

Final verification logs: `/tmp/froggy-onboarding-final-gate.log`, `/tmp/froggy-onboarding-e2e.log`, `/tmp/froggy-onboarding-backfill.log`, and `/tmp/froggy-onboarding-wallet-final.log`. The final gate and production build completed successfully after the last source changes. No approval, signing, or spending behavior changed.

## Production deployment

Railway deployment `89e787a8-8417-4d9e-886e-4b4c6b6eec84` completed successfully on 8 September 2026. It replaces `bce45847-38df-49f7-acd7-2bb3c73339a6` and contains exactly the 15 reviewed onboarding source/test changes over that production baseline. Container digest: `sha256:a75f0d8f975e46b4a315ba6b7cf2785fcdfac73a2906abb3e418b41952e688fe`.

The live `/health` returned HTTP 200 with `status: ok`. A fresh Playwright browser loaded the public sign-in page with HTTP 200 and no console or page errors. All 13 changed application source files on the deployed service matched the verified snapshot by SHA-256. The authenticated copy/loading interactions were exercised locally with the repository browser tests; no production sign-in or paid action was performed.

The live app is https://app-production-58dd.up.railway.app. Refresh an existing tab to load the updated interface.
