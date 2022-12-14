## NodeJS runtime

```
dapr run --app-id nodejs-runtime --app-protocol grpc --app-port 50002 npm run start
```

```
helm uninstall nodejs-runtime
helm install nodejs-runtime ./charts/nodejs-runtime
```