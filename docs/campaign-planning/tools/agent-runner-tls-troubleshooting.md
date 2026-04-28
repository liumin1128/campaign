# Agent Runner TLS Troubleshooting

## Recommended server URL

Use the production tool endpoint:

`https://campaign.react.mobi/`

Do not register temporary preview domains such as `https://campaign-theta-blond.vercel.app` in AgentSL Tool Studio unless you have separately validated their TLS chain from the Runner environment.

## Symptom

Runner fails before the tool executes and reports an error similar to:

`Agent runner failed: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Missing Authority Key Identifier (_ssl.c:1032)`

## What we verified

1. The preview domain is reachable and returns `200 OK` for both the site root and the benchmark API route.
2. The application code is not the primary failure point for this symptom.
3. On the current network path, TLS for the preview domain is being intercepted and re-signed by Zscaler.
4. This means the certificate presented to the client is not the original Vercel certificate chain.
5. If Agent Runner uses a different trust store or stricter certificate validation, TLS negotiation can fail before the HTTP request reaches the app.

## Why this happens

Enterprise TLS inspection proxies can replace the upstream certificate with an enterprise-issued certificate. If the Runner environment does not trust that proxy chain, or validates certificate extensions more strictly, the handshake fails with certificate verification errors.

## Recommended action

1. Register the tool with the production hostname `https://campaign.react.mobi/`.
2. Avoid using temporary preview domains for Tool Studio registration.
3. If the error persists on the production hostname, ask the platform or network team whether Agent Runner egress passes through Zscaler or another TLS inspection proxy.
4. Ask them to verify that the Runner trust store includes the required corporate root and intermediate certificates.
5. Confirm there is no redirect from the configured hostname to another hostname with a different certificate chain.

## Checks to run

Check the configured host and response headers:

```bash
curl -I https://campaign.react.mobi/
curl -I https://campaign.react.mobi/api/campaign-tools/benchmark-market-fares
```

Inspect the certificate chain presented on your current network:

```bash
openssl s_client -connect campaign.react.mobi:443 -servername campaign.react.mobi -showcerts
```

If you suspect a redirect or hostname rewrite:

```bash
curl -vkI --max-redirs 0 https://campaign.react.mobi/
```

## Message for platform or network teams

We can reach the campaign tool endpoint over HTTPS and the API route returns valid application responses, so the service itself is up. The failing path appears to be TLS validation in the Agent Runner environment. On our current network, the preview domain certificate is being intercepted and re-signed by Zscaler instead of serving the original upstream certificate chain. Please verify whether Runner egress is subject to TLS inspection, whether the relevant corporate root and intermediate certificates are present in the Runner trust store, and whether the configured tool hostname redirects to any other host during the handshake path.
