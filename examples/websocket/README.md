# WebSocket örneği (mini-servis başvuru deseni)

Bu klasör ANA UYGULAMANIN parçası DEĞİLDİR — `mini-services/` altında kendi
`package.json`'ı olan bağımsız servisler kurmak için başvuru (reference) örneğidir.

- Sunucu tarafı `socket.io` paketini ister: örnek klasörde `bun add socket.io`
  ile AYRI kurulur; ana uygulama yalnız `socket.io-client` kullanır.
- `tsconfig.json` derleme kapsamı bu klasörü bilinçli olarak dışlar
  (`exclude: ["examples"]`) — kapsam kararı ve gerekçesi tsconfig içindeki
  yorum bloğundadır. Bu bir hata gizleme değil, derleme-scope sözleşmesidir.
- Yol kuralı: `path: '/'` gateway yönlendirmesi için zorunludur (DEĞİŞTİRME).
- Çalıştırmak için: bağımsız bir mini-servis klasörü kurup içerikleri oraya
  taşıyın; o klasörün kendi `package.json` + `bun add socket.io` yeterlidir.
