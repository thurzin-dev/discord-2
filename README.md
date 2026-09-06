# Discord 2

Chamada de voz + compartilhamento de tela + chat, direto no navegador, sem conta e sem instalar nada.

**No ar:** https://thurzin-dev.github.io/discord-2/

## Como usar

1. Abra o link, digite seu nome e um código de sala (ex.: `galera`).
2. Clique em **Testar** para liberar o microfone e ver a barra se mexer com a sua voz.
3. **Entrar na call**. Clique em **Copiar link de convite** e mande para os amigos: quem abrir o link já cai na mesma sala.
4. **Compartilhar tela** mostra sua tela/janela/aba para todos (com áudio do sistema, se você marcar "Compartilhar áudio" na janela do Chrome).

Atalho: `M` muta/desmuta.

## Como funciona (resumo técnico)

- 100% estático (HTML/CSS/JS). Áudio e vídeo vão **direto entre os navegadores** (WebRTC, malha P2P). Nada passa por servidor.
- Sinalização pela nuvem pública do [PeerJS](https://peerjs.com) (`0.peerjs.com`). STUN do Google + TURN público (Open Relay) para redes restritivas.
- Cada sala tem até 12 vagas. O ID de cada pessoa é determinístico (`d2v1-<sala>-<vaga>`), então ninguém precisa de "host": quem entra tenta a vaga 0, 1, 2… e depois se conecta com todas as outras vagas.
- Regras que evitam conexão dupla e travamentos:
  - conexão de dados duplicada → vence a iniciada pela **maior** vaga;
  - chamada de voz → sempre iniciada pela **menor** vaga; se não conectar em 20 s, é refeita;
  - tela → segunda chamada de mídia, iniciada por quem compartilha;
  - a cada 10 s cada um conta aos outros quem está vendo ("presença"); quem estiver faltando se conecta.
- Sem microfone (permissão negada / sem dispositivo) você entra **só ouvindo** e pode tentar o mic de novo pelo botão.

## Rodar local

```bash
npx --yes http-server . -p 8142 -c-1
```

Abra http://localhost:8142/ (localhost conta como contexto seguro, então o microfone funciona).

`?debug=1` na URL liga os logs detalhados do PeerJS no console.

## Limitações

- Malha P2P: cada pessoa envia seu áudio para todas as outras. Fica pesado acima de ~8 pessoas com tela.
- Depende da nuvem gratuita do PeerJS para sinalização. Se ela cair, ninguém consegue *entrar* (chamadas já abertas continuam).
- Não há gravação, nem cargos, nem servidor persistente. É uma sala de voz.
