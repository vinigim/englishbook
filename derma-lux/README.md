# Derma Lux — Agenda de Aluguéis de Laser

Aplicação simples para controlar a agenda de aluguel dos seus lasers para médicos e clínicas.
Funciona 100% no navegador, **sem servidor e sem banco de dados** — os dados ficam salvos
localmente no seu computador (localStorage).

## Como usar

Abra o arquivo `index.html` no navegador (duplo clique) — pronto, já está funcionando.

## O que ela faz

- **Agenda / Próximas obrigações** — lista todos os aluguéis agendados, agrupados por data,
  com nome do cliente, endereço, telefone, valor, observações e o equipamento alugado.
  Busca por texto, filtro por equipamento e indicadores rápidos (aluguéis de hoje, próximos,
  total a receber).
- **Disponibilidade** — escolha um laser e uma data e veja num relance os horários **livres**
  (verde) e **ocupados** (vermelho). Clique num horário livre para já agendar naquele bloco.
- **Equipamentos** — cadastre seus lasers, cada um com uma cor de identificação.

### Cada aluguel registra
Nome do cliente · Endereço · Telefone · Equipamento (laser) · Data · Horário (início e término)
· Valor · Observações.

O sistema **avisa sobre conflitos** de horário no mesmo equipamento.

## Backup dos dados

Como os dados ficam no navegador, para trocar de computador ou fazer backup, no futuro pode-se
adicionar exportação/importação. Se quiser, é só pedir.
