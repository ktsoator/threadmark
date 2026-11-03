# threadmark

An AI discussion workspace with a Go backend and an Electron desktop client.

First-time setup, from the repository root:

```sh
go run ./cmd/sync-models
npm --prefix desktop ci
```

Start the backend:

```sh
export DEEPSEEK_API_KEY='your-api-key'
go run ./cmd/threadmark
```

Start the desktop client in another terminal, from the repository root:

```sh
npm --prefix desktop start
```

The backend listens on `127.0.0.1:8090` and saves sessions in `threadmark.db`.
Set `THREADMARK_ADDR` or `DEEPSEEK_MODEL` to override the address or default
model (`deepseek-flash`).
