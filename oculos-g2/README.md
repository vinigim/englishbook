# Parâmetros CO2 no óculos Even G2

App do Even Hub que mostra no óculos os parâmetros do SmartXide Punto das
consultas feitas no painel (`/derma-lux/parametros`) e ligadas a uma locação.
Projeto à parte do painel Next.js: tem o próprio `package.json` e fica fora do
`tsconfig` da raiz.

## Como funciona

1. No painel, numa consulta ligada a uma locação, clique em **Código para o
   óculos Even G2 → Gerar código**. Sai um código de 8 caracteres (`K7M2-QX9P`).
2. O médico abre o app no Even (celular) e digita o código. Também dá para
   abrir o app com `?codigo=K7M2QX9P` na URL.
3. O app lê `GET <painel>/api/oculos/<codigo>` e desenha no óculos:
   - lista das consultas da locação → **toque** abre;
   - telas da consulta (parâmetros, alertas, o que foi registrado, protocolo,
     resumo) → **deslizar** passa, **toque** avança, **toque duplo** volta;
   - na lista, **toque duplo** recarrega.

O código só vale da véspera até dois dias depois da locação. "Gerar outro"
invalida o anterior; "Cortar acesso" apaga. Nada aqui chama a IA nem grava
nada: é só leitura.

O texto vem pronto do painel (`src/lib/laser/oculos.ts`); este app só pagina
e desenha. Mudar o conteúdo das telas é um deploy do painel, sem nova versão
do app.

## Rodar

```bash
cd oculos-g2
npm install
cp .env.example .env.local   # e ponha o endereço do painel
npm run dev                  # Vite em :5173
npm run sim                  # simulador do G2 apontando para o Vite
npm run qr                   # QR para abrir no app Even (modo dev) no celular
```

O celular e o computador precisam estar na mesma rede para o modo dev.

## Publicar

1. Troque `https://SEU-DOMINIO-DO-PAINEL` em `app.json` (whitelist de rede)
   pelo endereço real do painel. Deve ser o mesmo de `VITE_LUX_URL`.
2. `npm run pack` gera `lux-parametros.ehpk`.
3. Envie em hub.evenrealities.com (conta Even Realities). Para uso interno,
   o app pode ficar privado/em teste sem passar pela loja.

## Limites do G2 que moldaram o app

- Tela 576×288, verde monocromática, linha de 27 px, uma fonte só. A fonte do
  firmware não tem "µ": time e spacing aparecem sem unidade, como na tabela
  do treinamento Premium.
- Texto não rola: `src/paginar.ts` mede com `@evenrealities/pretext` (a
  métrica do firmware) e corta em telas de até 8 linhas e 990 bytes.
- Item de lista: até 63 bytes e 20 itens.
- O clique chega sem `eventType` e o índice 0 da lista chega sem
  `currentSelectItemIndex` (valores padrão do protobuf são omitidos).
