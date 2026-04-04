# SecretPay — Notes Dev 2 (@privacy)

## Choix .env — Mock Receiver = Wallet EVM principal

Le `MOCK_RECEIVER_ADDRESS` et `MOCK_RECEIVER_PRIVATE_KEY` utilisent le **même wallet** que `EVM_PUBLIC_KEY` / `EVM_PRIVATE_KEY` :

```
MOCK_RECEIVER_ADDRESS=0x723B1Abbad41507Ecd4Fa7D20670614F90665f4e
MOCK_RECEIVER_PRIVATE_KEY=0x81d34d7a0750cdd6ed296eeab7f668212bd043db9df62c7e0034f6341edf49f5
```

**Pourquoi** : un seul wallet funded suffit pour le hackathon. Le mock server (port 4021) reçoit les paiements sur cette adresse. En prod on séparerait payer et receiver, mais ici c'est pas nécessaire.

**Impact** : aucun sur le module privacy. Le wallet agent (mnemonic) est différent du receiver.
