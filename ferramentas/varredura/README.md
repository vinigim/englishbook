# Varredura de leads

Procura dermatologistas, oftalmologistas e cirurgiões plásticos em
catalogo.med.br e doctoralia.com.br, cruza com o Radar e gera a planilha que a
tela **Importar planilha** do Radar lê. Roda na **primeira segunda-feira de cada
quinzena** (a do dia 1 ao 7 e a do dia 15 ao 21), numa sessão agendada do
Claude Code que dispara toda segunda: com `--agendada`, nas outras segundas o
script sai sem fazer nada. Só dias úteis, por escolha do dono. Também dá para
rodar à mão.

## Rodar

```bash
python3 ferramentas/varredura/rodada.py
```

Sem argumentos, varre as 8 cidades da quinzena, na ordem de `cidades.txt`.
`--cidades "Bauru,Marília"` escolhe outras. Leva de 15 a 30 minutos. Precisa
de `python3`, `curl` e `openpyxl` (`pip install openpyxl`).

A base do Radar vem de `GET https://lux-derma.vercel.app/api/varredura/base`,
que exige `Authorization: Bearer <VARREDURA_TOKEN>`. Na sessão na nuvem, o
token fica salvo como credencial do ambiente para esse host, e o proxy o
injeta: o script não lê nem grava segredo nenhum. Sem a credencial, o script
para com "Base do Radar indisponível (HTTP 401)".

Cache e saída ficam em `.varredura/` (fora do git, porque têm dado de lead):

| Arquivo | O que é |
|---|---|
| `saida/leads-lux-derma-AAAA-MM-DD-varredura.xlsx` | 1ª aba **Importar**: vai direto na importação do Radar. Abas "Sem telefone" e "Resumo" são consulta |
| `saida/celulares-novos-AAAA-MM-DD.vcf` | Celulares novos, para a agenda do telefone |
| `saida/resumo-AAAA-MM-DD.json` | Contagens da rodada |

## O que vai na aba Importar

Três tipos de linha, nesta ordem:

1. **Celular para lead do Radar**: o médico já está no Radar, o número dele
   não tem WhatsApp, e o perfil tem um celular. `Telefone` = celular,
   `Telefone anterior` = número do Radar: a importação troca o número do mesmo
   lead (migração 0031), sem criar outro.
2. **Perfil para lead do Radar**: o médico já está no Radar sem link de
   perfil. Sai com o telefone dele e `Perfil`, `CRM` e `RQE`.
3. **Lead novo**: até 200 km de Penápolis, telefone do DDD da cidade, fora
   central de hospital, Santa Casa e Unimed. Celular primeiro.

"Já está no Radar" = mesmo telefone (inclusive arquivado ou número anterior),
ou mesmo nome na mesma cidade.

## Bloqueio do catálogo

O catalogo.med.br bloqueia (503) depois de uns 20 minutos de consultas. No
primeiro bloqueio a rodada para de consultá-lo e segue só com o Doctoralia;
`sem_catalogo` no resumo lista as cidades que ficaram sem ele. Não insista: o
bloqueio passa em algumas horas.

## Para a sessão agendada

1. `pip install openpyxl` se faltar; rode
   `python3 ferramentas/varredura/rodada.py --agendada`. Se ele disser
   "SEM RODADA HOJE", encerre sem relatório e sem enviar nada.
2. Se a base der 401, pare e avise que falta a credencial de
   `lux-derma.vercel.app` (o token `VARREDURA_TOKEN` da Vercel).
3. Envie ao dono, com SendUserFile, a planilha e o .vcf da pasta `saida`.
4. Escreva um relatório curto em pt-BR, a partir do resumo: cidades varridas,
   quantos leads novos (quantos celulares), quantos celulares para leads do
   Radar, quantos perfis, e quais cidades ficaram sem o catálogo. Lembre que a
   planilha vai em **Importar planilha** e que a coluna "Telefone anterior"
   troca o número do lead.
5. Não faça commit da saída nem do cache; não publique nada.
