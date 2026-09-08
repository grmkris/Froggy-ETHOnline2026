# Review fixes — current screens

These 45 screenshots capture the application accompanying this commit, based on `89c24b11fa556621f18dd822d73085eda52fcfad`. All five main pages are captured at 1440×1000, 768×1024, 390×844, and 320×568. Additional parts walk the internal scroller so lower sections are included.

The screenshots use the compiled frontend, the Passbook theme, and an explicitly stubbed server. They show synthetic identities and funds. They do not demonstrate real sign-in, shared Chrome, or onchain settlement. The existing [two-theme interaction tour](../ui-review-2026-09-08/README.md) remains available as historical evidence.

| Page | Desktop | Tablet | Mobile | Narrow mobile |
| --- | --- | --- | --- | --- |
| Chat | [1440px](chat-1440.png) | [768px](chat-768.png) | [390px](chat-390.png) | [320px](chat-320.png) |
| Wallet | [1440px](wallet-1440.png) | [768px](wallet-768.png) | [390px](wallet-390.png) | [320px](wallet-320.png) |
| Services | [1440px](services-1440.png) | [768px](services-768.png) | [390px](services-390.png) | [320px](services-320.png) |
| Agents | [1440px](agents-1440.png) | [768px](agents-768.png) | [390px](agents-390.png) | [320px](agents-320.png) |
| Settings | [1440px](settings-1440.png) | [768px](settings-768.png) | [390px](settings-390.png) | [320px](settings-320.png) |

## All captures

- [agents-1440](agents-1440.png)
- [agents-320](agents-320.png)
- [agents-390](agents-390.png)
- [agents-768](agents-768.png)
- [agents-part-2-320](agents-part-2-320.png)
- [agents-part-2-390](agents-part-2-390.png)
- [agents-part-2-768](agents-part-2-768.png)
- [agents-part-3-320](agents-part-3-320.png)
- [chat-1440](chat-1440.png)
- [chat-320](chat-320.png)
- [chat-390](chat-390.png)
- [chat-768](chat-768.png)
- [chat-part-2-320](chat-part-2-320.png)
- [chat-part-2-390](chat-part-2-390.png)
- [chat-part-3-320](chat-part-3-320.png)
- [services-1440](services-1440.png)
- [services-320](services-320.png)
- [services-390](services-390.png)
- [services-768](services-768.png)
- [services-part-2-1440](services-part-2-1440.png)
- [services-part-2-320](services-part-2-320.png)
- [services-part-2-390](services-part-2-390.png)
- [services-part-2-768](services-part-2-768.png)
- [services-part-3-320](services-part-3-320.png)
- [services-part-3-390](services-part-3-390.png)
- [services-part-4-320](services-part-4-320.png)
- [services-part-5-320](services-part-5-320.png)
- [settings-1440](settings-1440.png)
- [settings-320](settings-320.png)
- [settings-390](settings-390.png)
- [settings-768](settings-768.png)
- [settings-part-2-1440](settings-part-2-1440.png)
- [settings-part-2-320](settings-part-2-320.png)
- [settings-part-2-390](settings-part-2-390.png)
- [settings-part-2-768](settings-part-2-768.png)
- [settings-part-3-320](settings-part-3-320.png)
- [settings-part-3-390](settings-part-3-390.png)
- [settings-part-4-320](settings-part-4-320.png)
- [settings-part-5-320](settings-part-5-320.png)
- [settings-part-6-320](settings-part-6-320.png)
- [wallet-1440](wallet-1440.png)
- [wallet-320](wallet-320.png)
- [wallet-390](wallet-390.png)
- [wallet-768](wallet-768.png)
- [wallet-part-2-320](wallet-part-2-320.png)

## Capture method

The existing `e2e/screens.spec.ts` and `capturePage` helper wait for fonts, check browser errors and horizontal overflow, and capture each internal scrolling section. The [manifest](captures.json) records dimensions and test names. Desktop wallet/services and mobile settings/chat captures were also inspected visually.

A temporary Playwright configuration inherited the repository's stub environment and served a `VITE_PRIVY_APP_ID=''` production build through the Bun server. Chromium temporary files were placed on the workspace disk because the shared `/tmp` filesystem was full. No application or test assertions were weakened to handle that machine issue.
