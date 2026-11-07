# ADR 0015: An AI helper for coding, review and learning to prompt, with any provider

- Status: Accepted. Explain and review built 2026-11-07 (see "Built"); the write mode is not built
- Date: 2026-11-07 (proposed; accepted the same day, with every recommended option)
- Amends: the "no runtime requests to third-party origins" rule ([CLAUDE.md](../../CLAUDE.md)
  hard constraint 3), for a fixed list of AI provider origins, used only after an adult turns the
  helper on and enters a key. [ADR 0011](0011-save-load-github.md) made the same kind of
  exception for GitHub.
- Builds on: [ADR 0014](0014-python-editing-on-blocks-page.md) (Python to blocks), which the
  "write code" mode needs

## Context

On 2026-11-07 the maintainer asked for a plan to use AI through an API, to help with coding or to
review code. Their reasons:

- in real software work today, AI already does a large part of the coding;
- children should learn to write prompts;
- it keeps the project as current as the way people work now.

They do not want MatPilot tied to one provider: OpenAI, Anthropic, DeepSeek and others should all
be possible.

The constraints:

- MatPilot has no backend ([ADR 0001](0001-browser-only-web-bluetooth.md),
  [ADR 0002](0002-static-export-no-server-features.md)).
- The production CSP allows only this site and GitHub's API in `connect-src`, and
  `scripts/verify-export.mjs` pins that list.
- The users are children.

Facts checked on 2026-11-07, with a CORS preflight from this site's origin (`curl -X OPTIONS`,
no key sent):

| Provider                    | Endpoint                                                                   | Answer                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Anthropic                   | `https://api.anthropic.com/v1/messages`                                    | 200; allows any origin, `POST`, and the headers `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access` |
| OpenAI                      | `https://api.openai.com/v1/chat/completions`                               | 200; allows this site, `POST`, and the headers `authorization`, `content-type`                                                |
| DeepSeek                    | `https://api.deepseek.com/chat/completions`                                | 200; same as OpenAI                                                                                                           |
| Google (OpenAI-style route) | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | 200; same as OpenAI                                                                                                           |

So a browser may call all four. A preflight only shows that the browser would send the request;
a real call with a key is the first building step.

Also checked:

- **Keys in a browser.** Anthropic's TypeScript SDK runs in a browser only with
  `dangerouslyAllowBrowser: true`. Its documentation warns that the key is then visible to anyone
  with that browser. It also says that organizations with zero data retention or the Compliance
  API cannot call from a browser at all (401)
  ([TypeScript SDK, browser usage](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)).
- **Children.** Anthropic's
  [guidelines for organizations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors)
  require two things: telling users that they are talking with an AI, and complying with child
  safety and privacy laws such as COPPA. They recommend age checks, content moderation,
  monitoring and reporting, and guidance for young users. Anthropic may also provide a
  child-safety system prompt for such products.
- **Anthropic's usage policy.** A revision with an effective date of 2026-11-12 lists products
  serving minors among the use cases with extra guidelines
  ([Anthropic, AI policy](https://www.anthropic.com/policy)). Other providers have terms of their
  own. Check them before offering a provider.

## Proposal

1. **A provider-neutral core** in `src/lib/ai/` (framework-agnostic, like the rest of
   `src/lib/`). Every mode sends the same request shape: fixed instructions, the program and the
   child's prompt. Every answer comes back in one shape.
   - One adapter for Anthropic's Messages API.
   - One adapter for the OpenAI-style chat completions route, which serves OpenAI, DeepSeek,
     Google's compatible route and others.
   - Whether each adapter uses the provider's SDK or plain HTTP is decided when building: every
     SDK adds download size.
2. **Bring your own key, set by an adult.** A settings dialog with:
   - the provider and the key;
   - the model, chosen from the provider's own model list (fetched with that key, so MatPilot
     carries no model names that go out of date);
   - on and off.

   The key stays in this browser: for the session by default, with an optional "remember on this
   computer". It never goes into program files, GitHub saves or logs. The dialog advises a separate
   key with a spending limit set at the provider.

3. **CSP.** `connect-src` gains the origins of the providers in the first version, written out in
   the layout and pinned in `verify-export.mjs`. There are no free-form endpoints: a static CSP
   cannot follow what someone types.
   - Later, as a separate decision: a model running on this computer (`http://localhost`), so
     that nothing leaves home.
4. **What the helper does,** from least to most risk:
   1. _Explain_: what the program does, in the child's language (Thai or English).
   2. _Review_: points at lines and blocks, each with a hint rather than a fix. The answer is
      structured (line, what, hint) so the page can highlight the blocks.
   3. _Write or change_: proposes Python from the child's prompt. MatPilot then checks it exactly
      like a person's code: the hub's compiler, the Python-to-blocks converter (ADR 0014) and the
      problems list. The child sees what would change and presses **Accept**, which is one undo
      step. Nothing runs on the hub by itself.
5. **Learning to prompt.**
   - A prompt box with a short checklist, which the page checks for free before anything is
     sent: what the robot should do, which motors or ports, distances in mm or times, and when to
     stop.
   - **What the AI sees:** the exact text that is sent (the prompt and the program), so nothing
     about prompting is hidden.
   - A prompt journal in this browser: the prompt, the answer, and whether it worked. A child can
     try a better prompt and compare.
   - Hint mode is the default for children: the AI asks guiding questions and explains. It writes
     code only when an adult allows the write mode.
6. **Safety for children, in every mode.**
   - Fixed instructions come first: robots and programming only, words suited to children, no
     personal information, other topics declined politely. With Anthropic, its child-safety
     system prompt if one is provided.
   - Every answer is labelled as coming from an AI.
   - The helper is off by default. An adult turns it on with a key, and the page keeps a daily
     limit on requests.
   - Answers never run on their own and never replace blocks on their own.
   - The settings dialog says that the program and the prompt go to the chosen provider.
7. **Cost.** Each answer shows the tokens used, and the page keeps a daily total, from the
   provider's usage fields.
   - Prices per million input/output tokens, from Anthropic's model list as of 2026-10-06:
     - Claude Opus 5.5 (`claude-opus-5-5`): $4 / $20;
     - Claude Sonnet 5.5 (`claude-sonnet-5-5`): $2 / $10;
     - Claude Haiku 5.5 (`claude-haiku-5-5`): $0.10 / $0.50.
   - Example: a review of a 2,000-token program, with 6,000 tokens of fixed instructions and an
     800-token answer:
     - Opus 5.5: about US$0.048 without caching (8,000 × $4/M + 800 × $20/M);
     - Haiku 5.5: about US$0.0012 (8,000 × $0.10/M + 800 × $0.50/M).
   - Keeping the fixed instructions first and unchanged lets each provider's prompt caching cut
     the input part.
   - For other providers, see their price pages.

**Decisions for the maintainer** (taken on 2026-11-07, see "Decision"):

- **D1, keys:**
  - (a) bring your own key in the browser. Recommended for home use and first trials;
  - (b) a small service, run by a school or by the maintainer, that holds the key so that
    children never see it. Classrooms need this. It is a backend, so it would be a separate
    service with an ADR of its own.
- **D2, providers in the first version:** which ones. Recommended: Anthropic plus the OpenAI-style
  adapter, which covers OpenAI and DeepSeek. Each origin is added to the CSP by name.
- **D3, modes for children:**
  - explain and review first, with hints (recommended);
  - write mode later, or only when an adult turns it on.
- **D4, who uses it first:**
  - the maintainer's child at home (recommended);
  - classrooms after D1 (b).
- **D5, order:**
  - ADR 0014 first, because the write mode needs it (recommended);
  - explain and review can be built alongside.

## Decision

The maintainer chose every recommended option on 2026-11-07:

- **D1, keys:** an adult enters their own key in the browser. In their words, adults set this up
  anyway, because children below the age limit cannot sign up for these services themselves. A
  key-holding service for classrooms would be a separate decision later.
- **D2, providers:** Anthropic, plus the OpenAI-style adapter for OpenAI and DeepSeek. Each origin
  goes into the CSP by name.
- **D3, modes:** explain and review with hints first. The write mode is turned on by an adult.
- **D4, first users:** the maintainer's child at home; classrooms later.
- **D5, order:** ADR 0014 first, then the helper.

## Built (2026-11-07): explain and review

What was built, and what was decided while building it. The write mode is not built.

- **Where:** an **AI helper** button at the bottom of `/blocks` opens a panel beside the blocks.
  The button shows even before setup, so an adult can find the settings; until an adult turns the
  helper on with a key and a model, the panel only says what it is and offers **Set up (for
  adults)**, and nothing is sent. (The proposal said the helper stays hidden without a key; this
  is the smallest change that still lets an adult find it.)
- **Code:** `src/lib/ai/` (providers, settings, usage and journal, prompt, checklist, answer,
  client), `src/hooks/useAiHelper.ts`, `src/components/blocks/AiPanel.tsx` and
  `AiSettingsDialog.tsx`. The panel's code loads when it opens (about 19 KB gzipped).
- **Clients (decision 1's open point):** the official SDKs, `@anthropic-ai/sdk` 1.6.0 and
  `openai` 7.53.0, both Apache-2.0 (see [NOTICE](../../NOTICE)). Each loads only when a question
  is asked or the models are listed: about 77 KB and 81 KB gzipped, measured on the 2026-11-07
  build. The page's first download does not include them.
- **Keys:** one per provider, in this browser tab only (sessionStorage) unless the adult ticks
  **Remember the keys**, then in localStorage. A key goes only to its provider; it is never put in
  program files, GitHub saves, the journal or "What the AI sees". SDK 1.6.0 sends the Anthropic key
  as `Authorization: Bearer`, which the API accepts like `x-api-key`.
- **CORS, checked again on 2026-11-07** with the headers the SDKs really send (their
  `x-stainless-*` headers, `anthropic-version`, `anthropic-beta`,
  `anthropic-dangerous-direct-browser-access`, `authorization`): all three providers answer the
  preflight with 200 and allow them. With `anthropic-dangerous-direct-browser-access: true`,
  Anthropic's error answers (401) also carry `Access-Control-Allow-Origin`, so the page can say
  "the key was not accepted" instead of a network error.
- **Models:** from the provider's own list, fetched with the key, which also checks the key; a
  model can be typed by hand too. For OpenAI the list leaves out models that do not answer chat
  completions (embeddings, speech, images, realtime and the like).
- **Anthropic's refusals:** a request asks for Anthropic's server-side fallback
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) only when the model's entry in
  the model list names fallback models; if the API refuses the option (400), the question is sent
  once more without it. An answer with `stop_reason: "refusal"` shows "The AI did not answer this".
- **The request:** fixed instructions first, the same for every question and mode so prompt
  caching can reuse them (marked `cache_control: ephemeral` for Anthropic); then the program, the
  open tab's file first, with numbered lines; then the task for the mode, the child's prompt, and
  the language. The fixed part includes the blocks' own words for every Python call, built from
  the Python editor's word list (`from-python/vocabulary.ts`), so the AI names blocks as the child
  sees them. No child-safety system prompt from Anthropic was available to this project, so the
  fixed instructions carry MatPilot's own rules (robots and programming only, no personal
  information, words for children, hints rather than fixes, never pretend to be a person).
- **Answers:** marked "Answer from an AI" with the provider and the model, and the tokens used
  (with the cached part). "Line N:" at the start of a point becomes a button that marks that line
  in the Python. Answers are text; nothing in them runs or changes blocks.
- **Learning to prompt:** a checklist of four habits (ask one clear question; say which part;
  say what you want or what happens now; say how to answer), ticked as the child types, in Thai or
  English. It advises and never blocks a question. "What the AI sees" shows the exact text. The
  journal keeps the last 30 prompts with their answers and whether they helped, in this browser.
- **Daily limit:** 20 questions a day by default (1 to 500), counted in this browser. A question
  counts when it is answered; a failed call does not.
- **Tests:** unit tests for every module; the client is tested against a fake provider through the
  SDKs' `fetch` option, so the real SDK code builds the requests. A headless Chromium run on the
  production build (with its CSP) answers the providers' requests with a fake through the
  DevTools protocol: setup, model list, ask, Line link, journal, a 402 from DeepSeek, the daily
  limit, and only the providers' origins called. No real key was used; the
  [checks with a real key](../compatibility.md#ai-helper-checks-milestone-9) are the
  maintainer's.
- **Not built:** the write mode, streaming answers, Google's OpenAI-style route, and a model on
  this computer.

## Consequences

- Hard constraint 3 now reads "GitHub, plus the listed AI providers once an adult turns the
  helper on". `verify-export.mjs` pins the list (and requires each origin), and a unit test keeps
  it equal to `src/lib/ai/providers.ts`.
- Answers differ between providers and models. MatPilot checks code the same way whichever wrote
  it (compiler, converter, problems), so a weaker model cannot break a program. Its code can only
  be refused.
- Anyone who uses that browser can read a key stored there. The spending limit at the provider is
  the real protection.
- With no key, nothing is sent: the panel only offers setup to an adult.
