# Carga

App para acompanhar progresso de carga na academia. Visual escuro inspirado no Liftoff, com animações elásticas (molas reais via `linear()` no CSS).

Abrir: `academia/` no GitHub Pages (ex.: https://thurzin-dev.github.io/discord-2/academia/). No celular, "Adicionar à tela inicial" instala como app e funciona offline.

## O que tem

- Registro de treino: séries com kg × reps, coluna "anterior", campo vazio herda o valor da última vez
- Gráfico por exercício (1RM estimado, carga máxima, volume) com filtro de período
- Ranks de Ferro a Titã por exercício, por grupo muscular e geral (1RM ÷ peso corporal)
- Recordes automáticos, inclusive ao vivo durante o treino, com confete
- Sequência semanal com meta de treinos por semana + calendário de frequência
- Peso corporal com gráfico, medidas corporais com variação
- Fotos de progresso com comparação antes/depois (ficam só no aparelho)
- Timer de descanso automático (vibra e apita)
- Metas de carga com barra de progresso
- 21 conquistas
- Calculadora de anilhas e de 1RM, rotinas, séries por grupo muscular na semana
- Backup em JSON (exportar/importar)

Tudo é salvo no aparelho (localStorage + IndexedDB). Nada vai para servidor.

## Rodar local

```bash
npx --yes http-server academia -p 8155 -c-1
```
