# threadmark
An AI-powered discussion workspace that turns conversations into reviewed, version-controlled knowledge.

## Model catalog

Before building, run the following command from the repository root to download the model catalog snapshot:

```sh
go run ./cmd/sync-models
```

The generated `internal/modelcatalog/data/models.json` file is ignored by Git. It is embedded at build time, so the compiled program can read the catalog offline. Run the command again and rebuild to update the embedded data.
