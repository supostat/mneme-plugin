## Чеклист

- [ ] `npm test` зелёный локально
- [ ] Изменения в `plugin/` сопровождены бампом версии в `plugin.json` (иначе CI бампнет сам)

### Разовые ручные гейты (отметить, если PR их касается)

- [ ] **Проводка release-sync доказана красным прогоном**: фиктивный dispatch с
      несуществующими ассетами (`gh api repos/<owner>/<repo>/dispatches
      -f event_type=engine-release -F 'client_payload=@<фиктивный-payload>.json'`)
      → прогон падает на шаге integrity-гарда, main не тронут. Красный прогон на
      гарде = успех теста.
- [ ] **Сквозная установка через лаунчер**: `rm -rf ~/.mneme/bin && npm run reinstall`
      → `/reload-plugins` → `/mcp` видит инструменты mneme (dev-режим лаунчера).
- [ ] **Публикация лендинга**: Settings → Pages → Source: «GitHub Actions» включён
      (разовый шаг); прогон workflow `pages` зелёный;
      https://supostat.github.io/mneme-plugin/ открывается; OG-карточка валидна
      (opengraph.xyz или превью ссылки в Telegram показывает og.png).
