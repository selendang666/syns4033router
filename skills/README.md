# SYNS4033Router — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use SYNS4033Router for you.

> Tip: start with the **syns4033router** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router-web-fetch/SKILL.md |
| Using superpowers (discipline) | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/using-superpowers/SKILL.md |
| Multi-brain (shared memory) | https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/multi-brain/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, …):

```
Read this skill and use it: https://raw.githubusercontent.com/selendang666/syns4033router/refs/heads/master/skills/syns4033router/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, etc.

## Configure your shell once

```bash
export SYNS4033ROUTER_URL="http://localhost:20128"   # local default, or your VPS / tunnel URL
export SYNS4033ROUTER_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl $SYNS4033ROUTER_URL/api/health` → `{"ok":true}`.

## Links

- Source: https://github.com/selendang666/syns4033router
- Dashboard: https://syns4033router.com
