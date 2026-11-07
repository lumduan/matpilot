# ADR 0011: Undo and redo, Save and Load, and programs on GitHub

- Status: Accepted
- Extended by: [ADR 0016](0016-robots-and-mats.md) (amendment of 2026-11-07): the same GitHub setup also saves and loads robots and mats, in the same folder
- Date: 2026-11-06
- Amends: the "no runtime requests to third-party origins" rule ([CLAUDE.md](../../CLAUDE.md) hard
  constraint 3), for one origin, only when the user asks.

## Context

After the Blocks hardware checks passed (2026-11-06), the maintainer asked for three things on
`/blocks`:

- **Undo and redo buttons**, to go back easily.
- **Save**, to back up a program, and **Load**, to open it again.
- **Save and load on GitHub**, because their child builds programs with a team of friends, and a
  shared GitHub repository is the convenient place for that.

What existed:

- Blockly already records an undo stack, and Ctrl+Z / Ctrl+Shift+Z work while the blocks have
  focus, but there were no buttons.
- The workspace was saved in this browser only (`localStorage`). There was no way to move a
  program to another computer or to a teammate.
- "Start over" cleared the blocks and loaded the starter without recording the load, so Undo
  could not take a Start over back as one step.

The constraints:

- MatPilot has no backend ([ADR 0001](0001-browser-only-web-bluetooth.md),
  [ADR 0002](0002-static-export-no-server-features.md)). Everything below runs in the browser.
- MatPilot made no request to any other origin, enforced by a production CSP (`connect-src
'self'`) and by `scripts/verify-export.mjs`. **Saving to GitHub cannot work without sending
  requests to GitHub,** so that rule needs an exception.

Facts checked on 2026-11-06:

- **GitHub's REST API allows requests from any web page.** A CORS preflight to
  `https://api.github.com/repos/{owner}/{repo}/contents/{path}` answered
  `Access-Control-Allow-Origin: *`, allowing `PUT` and the headers `Authorization`,
  `Content-Type` and `X-GitHub-Api-Version` (checked with `curl`, with this site as `Origin`).
- **GitHub's API caches answers.** `GET` answers carry `Cache-Control: public, max-age=60`. A
  folder listed right after a save could be a minute old, so every request must bypass the cache.
- **GitHub's sign-in ("OAuth") cannot be finished in a browser alone.** Its device-flow and token
  endpoints (`https://github.com/login/device/code`, `https://github.com/login/oauth/access_token`)
  send no CORS headers, so a page cannot read their answers; the standard flow also needs a client
  secret. Both need a server, which MatPilot does not have.
- **A fine-grained personal access token can be limited** to one repository and to "Contents: Read
  and write". GitHub's token page can be opened with the name, description, owner, lifetime and
  permissions filled in (URL parameters `name`, `description`, `target_name`, `expires_in`,
  `contents`).
  - The user still picks the repository.
  - These tokens cannot be used for repositories where the user is only an outside or repository
    collaborator. They work for repositories the user owns, and for repositories of an
    organisation the user is a member of.
  - Source:
    [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
    (sections "Fine-grained personal access tokens limitations" and "Pre-filling fine-grained
    personal access token details using URL parameters").
- **Creating or replacing a file** is one `PUT` to the contents API, with the content in Base64.
  Replacing needs the `sha` of the file being replaced, and a stale `sha` is refused (409).
  Source: [REST API endpoints for repository contents](https://docs.github.com/en/rest/repos/contents).
- **GitHub accounts are for people aged 13 or over**
  ([GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service),
  definition of "User"). For a team of children, the repository and the tokens may belong to a
  parent's or a teacher's account; "Your name" (below) still records who saved what.

## Decision

1. **Undo and redo buttons** float over the top right of the blocks, 44 px across for small
   fingers, and are disabled when there is nothing to undo or redo. The keyboard shortcuts stay
   Blockly's.
2. **Opening a program, and Start over, are one undo step each.** The blocks are replaced with
   `recordUndo` in one event group.
   ➡️ **Replaced on 2026-11-06 by [ADR 0013](0013-block-tabs.md), decision 7:** with tabs, these
   changes are undone from the notice that appears, and the `mp_program_meta` event below is gone.
   - A custom Blockly event (`mp_program_meta`) in the same group carries the program's name and
     its GitHub file. Undo puts back both the old blocks and the old name and file, so Undo never
     leaves a teammate's GitHub file attached to your own blocks.
   - A file is first loaded into a scratch workspace. A file with unknown blocks changes nothing
     and shows a message.
   - After loading, "when the program starts" is scrolled into view if it is out of view.
3. **The program file is JSON**, named `<program name>.matpilot.json` (➡️ version 2, with tabs,
   since 2026-11-06: [ADR 0013](0013-block-tabs.md), decision 8; version 1 files still open):
   `format: "matpilot-blocks"`, `version: 1`, `name`, `savedBy`, `savedAt`, `python` (the
   generated code as a list of lines, so it reads well on GitHub; ignored when loading), and
   `workspace` (Blockly's serialization).
   - A newer `version` is refused with "saved by a newer MatPilot".
   - Names keep letters in any script and spaces, and drop characters that file systems or paths
     refuse.
4. **Save on this computer** downloads the file through the browser. **Load from this computer**
   reads a chosen file. No permission or API beyond a download and a file picker is needed.
5. **Save and Load on GitHub** use the REST contents API from the browser, with a fine-grained
   personal access token that the user pastes.
   - Settings: the repository (`owner/name`, a link, or an SSH address), a folder (default
     `matpilot`), and an optional "Your name". GitHub always uses the repository's default
     branch.
   - Public repositories load without a token. Saving always needs one.
   - **Check and save** reads the repository with the new token before the settings are kept, and
     says whether the account can push.
   - The settings dialog explains how to make a token, links to GitHub's prefilled token page,
     and gives the team setup: a free organisation, with each teammate a member.
6. **A save never silently replaces a teammate's work.** Before writing, the file is read.
   - It is replaced only when its `sha` is the one this program was opened from or last saved
     as.
   - Otherwise nothing is written, and the user chooses: **Save mine as a new program**
     (`<name> 2`, the first free name), **Replace it**, or **Cancel**. A teammate's newer version
     also offers **See who changed it** (the file's history on github.com).
   - A save that races another save (409) is reported the same way.
7. **Commit messages** are the user's note, or "Add/Update <name>", then "(saved by <name>)" when
   a name is set, and the line "Saved from MatPilot." One file per save, one commit per save.
8. **The token stays in this browser.**
   - "Remember the token on this computer" is on by default. It keeps the token in
     `localStorage`.
   - Unticked, the token lives only in the page's memory and is gone when the page closes. Use
     that on shared computers.
   - **Forget the token** removes it.
   - The token is sent only to `https://api.github.com`, with `credentials: 'omit'`,
     `referrerPolicy: 'no-referrer'` and `cache: 'no-store'`.
9. **The CSP allows exactly one more origin:** `connect-src 'self' https://api.github.com`.
   - The page sends nothing to GitHub until the user opens GitHub settings, Save on GitHub, or
     Load on GitHub.
   - `scripts/verify-export.mjs` now reads the CSP of every exported page. It fails the build
     unless `default-src` is exactly `'self'` and every source is one of `'self'`, `'none'`,
     `'unsafe-inline'`, `'wasm-unsafe-eval'`, `data:` in `img-src`, or `https://api.github.com` in
     `connect-src`.
   - Scripts, styles, fonts and images still come only from this site.
10. **Ctrl+S / ⌘S opens Save and Ctrl+O / ⌘O opens Load** on `/blocks`, as in other editors.

## Consequences

- **The privacy promise changes, narrowly.** "Sends nothing to any server" becomes "sends nothing
  to any server, except to GitHub when you save or load a program there". The site footer, the
  `/blocks` introduction, README, CLAUDE.md, CONTRIBUTING.md, SECURITY.md and the architecture page
  now say so.
- **A team can share programs with history.** Each save is a commit naming who saved it, and
  github.com shows every version. MatPilot itself shows no history and does no merging; two
  versions of one program are kept side by side instead ("<name> 2").
- **Pasting a token is a hurdle for a child**, so a parent or teacher sets it up once per
  computer. With "Remember" on, the child only presses Save and Load afterwards.
- **A token in `localStorage` can be read by any script on this origin.** The CSP allows scripts
  only from this site (plus inline bootstrap scripts that the static export needs). The token can
  reach one repository's contents only, and it expires (one year, as prefilled).
- **GitHub limits requests, most tightly without a token.** MatPilot treats 429, and 403 with
  `x-ratelimit-remaining: 0`, as that limit, and says when GitHub allows requests again (from
  `x-ratelimit-reset`).
- **Not built:** saving Python from `/program`, choosing a branch, seeing history or diffs in
  MatPilot, deleting or renaming files on GitHub, and signing in with GitHub (needs a server).
