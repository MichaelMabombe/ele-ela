# Ela&Ele - Reservas e Pagamentos Online

Sistema web para salao com area de cliente e area administrativa.

## Como executar

```bash
npm install
npm start
```

Aplicacao: `http://localhost:3000`

## Credenciais admin padrao

- Email: `admin@eleela.com`
- Senha: `admin123`

## Modulos implementados

- Autenticacao: cadastro, login e logout
- Cliente:
  - dashboard com historico de reservas
  - nova reserva com selecao de servico/profissional/data/hora
  - pagamento integrado simulado (M-Pesa, e-Mola, Cartao)
  - cancelamento de reserva
- Admin:
  - dashboard com estatisticas e receitas
  - gestao de servicos
  - gestao de profissionais
  - agenda: confirmar/cancelar/concluir/reagendar reservas
  - financeiro: lista de pagamentos
  - relatorios consolidados

## Persistencia

Dados sao salvos em `data/db.json` (gerado automaticamente na primeira execucao).

## MySQL (schema + migracao)

Se quiser persistir os dados em MySQL, o projeto inclui:

- Schema: `database/schema.sql`
- Migracao JSON -> MySQL: `scripts/migrate-json-to-mysql.js`

1. Configure as variaveis de ambiente (base em `.env.example`):
   - `MYSQL_HOST`
   - `MYSQL_PORT`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `MYSQL_DATABASE`
2. Execute a migracao:

```bash
npm run mysql:migrate
```

Esse comando cria o banco/tabelas (se nao existirem) e importa os dados de `data/db.json`.
