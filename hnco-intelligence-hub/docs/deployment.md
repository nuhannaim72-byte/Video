# Deploying to Azure

> These steps were written from the configuration this project needs. They were **not run against
> an Azure subscription**. The two container images they deploy were built and run locally.

Target: **Azure Container Apps** for the web app and the API, **Azure Database for PostgreSQL
Flexible Server** with pgvector, **Azure Blob Storage** for deliverables, **Key Vault** for the
OpenAI key, and **Microsoft Entra ID** for sign-in.

## 1. Entra ID app registrations

1. **API app** (`hnco-hub-api`)
   - Expose an API: Application ID URI `api://<api-client-id>`, scope `Hub.Access`.
   - App roles (allowed member types: users/groups): `Hub.Director`, `Hub.Member`, `Hub.Auditor`.
   - Assign users or groups to roles under *Enterprise applications → hnco-hub-api → Users and groups*.
2. **Web app** (`hnco-hub-web`)
   - Platform: single-page application, redirect URI `https://<web-host>/hq`.
   - API permissions: `hnco-hub-api / Hub.Access` (delegated), then grant admin consent.

## 2. Resources

```bash
RG=hnco-hub; LOC=uksouth; ACR=hncohub$RANDOM
az group create -n $RG -l $LOC
az acr create -g $RG -n $ACR --sku Basic
az containerapp env create -g $RG -n hnco-env -l $LOC

# PostgreSQL with pgvector
az postgres flexible-server create -g $RG -n hnco-db -l $LOC --tier Burstable --sku-name Standard_B1ms \
  --version 16 --admin-user hnco --admin-password '<strong password>' --public-access None
az postgres flexible-server parameter set -g $RG -s hnco-db -n azure.extensions --value vector
az postgres flexible-server db create -g $RG -s hnco-db -d hnco

# Storage for deliverables
az storage account create -g $RG -n hncohubfiles$RANDOM -l $LOC --sku Standard_LRS --allow-blob-public-access false
```

Connect the Container Apps environment to the database over a virtual network (private access),
rather than opening the database to the internet.

## 3. Build and push the images

Run from the `hnco-intelligence-hub` folder (the images need `shared/`):

```bash
az acr build -r $ACR -t hnco-api:1 -f api/Dockerfile .
az acr build -r $ACR -t hnco-web:1 -f web/Dockerfile . \
  --build-arg NEXT_PUBLIC_ENTRA_CLIENT_ID=<web-client-id> \
  --build-arg NEXT_PUBLIC_ENTRA_TENANT_ID=<tenant-id> \
  --build-arg NEXT_PUBLIC_ENTRA_API_SCOPE=api://<api-client-id>/Hub.Access
```

## 4. Deploy

```bash
# API: internal ingress only — the browser never calls it directly.
az containerapp create -g $RG -n hnco-api --environment hnco-env \
  --image $ACR.azurecr.io/hnco-api:1 --registry-server $ACR.azurecr.io \
  --ingress internal --target-port 8000 --min-replicas 1 --max-replicas 1 \
  --system-assigned \
  --secrets openai-key=<key or Key Vault reference> db-url='postgresql+asyncpg://hnco:<password>@hnco-db.postgres.database.azure.com:5432/hnco?ssl=require' \
  --env-vars ENVIRONMENT=production AUTH_MODE=entra ENTRA_TENANT_ID=<tenant-id> \
    ENTRA_AUDIENCES='["api://<api-client-id>","<api-client-id>"]' \
    OPENAI_API_KEY=secretref:openai-key DATABASE_URL=secretref:db-url \
    AZURE_STORAGE_ACCOUNT_URL=https://<storage-account>.blob.core.windows.net \
    CORS_ORIGINS='["https://<web-host>"]'

# Web: public ingress.
az containerapp create -g $RG -n hnco-web --environment hnco-env \
  --image $ACR.azurecr.io/hnco-web:1 --registry-server $ACR.azurecr.io \
  --ingress external --target-port 3000 --min-replicas 1 \
  --env-vars HNCO_API_URL=http://hnco-api
```

Give the API's managed identity the **Storage Blob Data Contributor** role on the storage account.

## Notes

- **One API replica.** Agent status and the live event stream are held in the API process. Keep
  `--max-replicas 1`. Scaling out needs a shared event bus (for example Redis pub/sub) first.
- **Server-Sent Events.** The stream sends a keep-alive every 15 seconds. If a gateway sits in front
  of the web app, disable response buffering for `/api/hub/events`.
- **Tasks in flight are not resumed** after an API restart: persisted tasks stay in their last
  state. Resubmit anything that was mid-work.
- **Any secure host works.** The images are plain containers; the same settings apply elsewhere.
