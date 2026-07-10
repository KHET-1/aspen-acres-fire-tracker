# Copilot Instructions for Aspen Acres Fire Tracker

## Repository map
- Main app: `index.html` (single-page static site with inline CSS/JS)
- High-level docs: `README.md`
- Local extension tool: `.github/extensions/push-deploy-tool/extension.mjs`

## Working conventions
- Keep changes focused and production-safe for a static site.
- Preserve accessibility and mobile-first behavior.
- Keep all emergency/safety wording conservative and source-linked.
- Do not represent this tracker as an official emergency alert system.

## Safe edit workflow
1. Read `README.md` and the relevant section in `index.html`.
2. Make minimal, coherent edits in place.
3. Validate JavaScript syntax from embedded script blocks.
4. Use local extension tools for quick context and deploy flow.

## Preferred commands
- Syntax check embedded JS:
  - `awk '/<script>/{flag=1;next}/<\\/script>/{flag=0}flag' index.html > /tmp/site.js && node --check /tmp/site.js`
- Deploy (after auth):
  - `npx --yes vercel --prod --yes`

## Extension tools available in this repo
- `workspace_context_snapshot`
  - Returns branch, git status, and key files for fast orientation.
- `workspace_push_and_deploy`
  - Pushes current branch to remote.
  - Optionally deploys with Vercel and returns detected deployment URL.

## Deployment/auth notes
- If deploy fails with auth errors, run `npx vercel login`.
- If push fails with auth errors, run `gh auth login` or set git credentials.
