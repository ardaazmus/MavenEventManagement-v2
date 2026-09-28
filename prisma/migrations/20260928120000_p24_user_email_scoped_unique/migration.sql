-- N-03: aynı kiracıda yinelenen kullanıcı e-postasını DB düzeyinde yasakla
-- (kayıt/davet check-then-create yarışını kapatır). Kiracılar-arası aynı
-- e-posta serbesttir; giriş parola-eşleşme + tenantSlug ile çözülür.

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
