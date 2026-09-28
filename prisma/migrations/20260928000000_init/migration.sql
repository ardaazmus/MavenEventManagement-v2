-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'PRO',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoUrl" TEXT,
    "tagline" TEXT,
    "aboutText" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "website" TEXT
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ORG_ADMIN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "mfaSecretCipher" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recoveryCodes" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "consentVersion" TEXT,
    "consentAcceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "name" TEXT,
    "aaguid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KvkkErasureRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "personId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "rejectReason" TEXT,
    "verifiedAt" DATETIME,
    "completedAt" DATETIME,
    "handledBy" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME NOT NULL,
    CONSTRAINT "KvkkErasureRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "website" TEXT,
    "country" TEXT,
    "city" TEXT,
    "taxNo" TEXT,
    "logoUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "generalEmail" TEXT,
    "address" TEXT,
    "description" TEXT,
    "locationNote" TEXT,
    CONSTRAINT "Organization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrganizationContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'PRIMARY',
    "department" TEXT,
    CONSTRAINT "OrganizationContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "company" TEXT,
    "country" TEXT,
    "city" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "linkedin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoId" TEXT,
    "parentPersonId" TEXT,
    "relationType" TEXT,
    "consentVersion" TEXT,
    "consentAcceptedAt" DATETIME,
    "commsOptIn" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Person_parentPersonId_fkey" FOREIGN KEY ("parentPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "logoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventEdition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "seriesId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "editionLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "venueName" TEXT,
    "city" TEXT,
    "country" TEXT,
    "format" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "description" TEXT,
    "coverColor" TEXT,
    "languages" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "headerImageUrl" TEXT,
    "portalHeaderTitle" TEXT,
    "portalHeaderSubtitle" TEXT,
    "portalHeaderImageUrl" TEXT,
    "portalHeaderAccent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventEdition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventEdition_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "setupNote" TEXT,
    CONSTRAINT "EventCapability_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventOrganizationAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventOrganizationAssignment_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventOrganizationAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventParticipation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ADMIN_ENTRY',
    "attendance" TEXT NOT NULL DEFAULT 'NOT_ARRIVED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventParticipation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventParticipation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventProfileSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participationId" TEXT NOT NULL,
    "badgeName" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "country" TEXT,
    "specialNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventProfileSnapshot_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "confirmationNo" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ADMIN_ENTRY',
    "fundingSource" TEXT NOT NULL DEFAULT 'SELF_PAID',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Registration_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Registration_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Registration_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RegistrationCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegistrationCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "paymentInstruction" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RegistrationCategory_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "personId" TEXT NOT NULL,
    "participationId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "offeredAt" DATETIME,
    "offerExpiresAt" DATETIME,
    "respondedAt" DATETIME,
    "convertedRegistrationId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WaitlistEntry_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WaitlistEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WaitlistEntry_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WaitlistEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RegistrationCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WaitlistEntry_convertedRegistrationId_fkey" FOREIGN KEY ("convertedRegistrationId") REFERENCES "Registration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventRoleAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "customRoleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventRoleAssignment_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventRoleAssignment_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "organizationId" TEXT,
    "personId" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "suggestedCategoryId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "sentAt" DATETIME,
    "respondedAt" DATETIME,
    "convertedRegistrationId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM',
    "audience" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "honeypotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minSubmitSeconds" INTEGER NOT NULL DEFAULT 4,
    "maxPerEmailPerDay" INTEGER NOT NULL DEFAULT 5,
    "blockedDomains" TEXT,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "enableOnlinePayment" BOOLEAN NOT NULL DEFAULT false,
    "defaultCategoryId" TEXT,
    "successMessage" TEXT,
    "slug" TEXT,
    "captchaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hasPublicResults" BOOLEAN NOT NULL DEFAULT false,
    "enableSteps" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" TEXT,
    "confirmEmail" BOOLEAN NOT NULL DEFAULT false,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormDefinition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "placeholder" TEXT,
    "options" TEXT,
    "required" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "conditionField" TEXT,
    "conditionValue" TEXT,
    "sensitivity" TEXT NOT NULL DEFAULT 'STANDARD',
    "mobileInteractive" BOOLEAN NOT NULL DEFAULT false,
    "correctAnswer" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 100,
    "step" INTEGER NOT NULL DEFAULT 1,
    "logicRules" TEXT,
    "logicMode" TEXT,
    "logicAction" TEXT,
    "gotoStep" INTEGER,
    "points" INTEGER,
    "columns" TEXT,
    CONSTRAINT "FormField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "submissionId" TEXT,
    "participationId" TEXT,
    "answer" TEXT,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormAnswer_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormAnswer_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "registrationId" TEXT,
    "respondentName" TEXT NOT NULL,
    "respondentEmail" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "spamScore" REAL NOT NULL DEFAULT 0,
    "spamReasons" TEXT,
    "honeypotValue" TEXT,
    "elapsedSeconds" REAL,
    "submitIp" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB_PUBLIC',
    "quizScore" REAL,
    "quizCorrect" INTEGER,
    "quizTotal" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "vendor" TEXT,
    "incurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spentBy" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'COMPANY_CARD',
    "status" TEXT NOT NULL DEFAULT 'PENDING_RECEIPT',
    "receiptNo" TEXT,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'DIGER',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "payer" TEXT,
    "incomeDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "receiptNo" TEXT,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Income_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'TICKET',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "quantity" INTEGER,
    "availableFor" TEXT NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CatalogItem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "ownerOrganizationId" TEXT,
    "ownerPersonId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SPONSOR_PACKAGE',
    "type" TEXT NOT NULL DEFAULT 'COMPLIMENTARY_REGISTRATION',
    "label" TEXT NOT NULL,
    "quantityGranted" INTEGER NOT NULL DEFAULT 0,
    "quantityConsumed" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "restrictions" TEXT,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    CONSTRAINT "Entitlement_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entitlement_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntitlementClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entitlementId" TEXT NOT NULL,
    "participationId" TEXT,
    "registrationId" TEXT,
    "guestName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" DATETIME,
    "releasedAt" DATETIME,
    "notes" TEXT,
    CONSTRAINT "EntitlementClaim_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "Entitlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntitlementClaim_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EntitlementClaim_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "buyerOrganizationId" TEXT,
    "buyerPersonId" TEXT,
    "payerName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "participationId" TEXT,
    "registrationId" TEXT,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "source" TEXT NOT NULL DEFAULT 'ONLINE_CARD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "enteredBy" TEXT,
    "reason" TEXT,
    "approvedBy" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "idempotencyKey" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorTierDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "brandingRules" TEXT,
    CONSTRAINT "SponsorTierDefinition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "tierId" TEXT,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "description" TEXT,
    "rightsSpec" TEXT,
    CONSTRAINT "SponsorPackage_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorPackage_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "SponsorTierDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorAgreement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packageId" TEXT,
    "tierId" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "signedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SponsorAgreement_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorAgreement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorAgreement_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SponsorPackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SponsorAgreement_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "SponsorTierDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LOGO',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" DATETIME,
    "responsible" TEXT,
    "notes" TEXT,
    CONSTRAINT "Deliverable_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HotelProperty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "logoUrl" TEXT,
    "imageUrl" TEXT,
    "email" TEXT,
    "website" TEXT,
    "starRating" INTEGER,
    "checkInNote" TEXT,
    "mapsUrl" TEXT,
    "transportInfo" TEXT,
    "localPhoneCode" TEXT,
    "powerInfo" TEXT,
    CONSTRAINT "HotelProperty_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "pricePerNight" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    CONSTRAINT "RoomType_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "HotelProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releaseDate" DATETIME,
    "cancellationPolicy" TEXT,
    "payerPolicy" TEXT,
    CONSTRAINT "RoomBlock_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "HotelProperty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomBlock_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryNight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "reservedRooms" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InventoryNight_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "RoomBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "blockId" TEXT,
    "roomTypeId" TEXT,
    "primaryGuestParticipationId" TEXT,
    "guestName" TEXT NOT NULL,
    "checkIn" DATETIME NOT NULL,
    "checkOut" DATETIME NOT NULL,
    "payerType" TEXT NOT NULL DEFAULT 'SELF',
    "payerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "occupancyType" TEXT,
    "ratePerNight" INTEGER NOT NULL DEFAULT 0,
    "nights" INTEGER NOT NULL DEFAULT 0,
    "noShow" BOOLEAN NOT NULL DEFAULT false,
    "noShowFee" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reservation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reservation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "RoomBlock" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_primaryGuestParticipationId_fkey" FOREIGN KEY ("primaryGuestParticipationId") REFERENCES "EventParticipation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OccupancySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT NOT NULL,
    "participationId" TEXT,
    "guestName" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "OccupancySlot_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccupancySlot_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoommateRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterParticipationId" TEXT NOT NULL,
    "targetParticipationId" TEXT,
    "targetName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScientificSetup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "callTitle" TEXT,
    "callDescription" TEXT,
    "reviewMode" TEXT NOT NULL DEFAULT 'SINGLE_BLIND',
    "submissionDeadline" DATETIME,
    "reviewDeadline" DATETIME,
    "wordLimit" INTEGER,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScientificSetup_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "Track_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "trackId" TEXT,
    "submitterId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "type" TEXT NOT NULL DEFAULT 'ORAL',
    "keywords" TEXT,
    "presentingAuthorName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fileUrl" TEXT,
    "posterNo" TEXT,
    "fileStatus" TEXT,
    "anonymizedBody" TEXT,
    "reviewStatus" TEXT DEFAULT 'UNASSIGNED',
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Submission_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Authorship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "organizationName" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPresenting" BOOLEAN NOT NULL DEFAULT false,
    "isCorresponding" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Authorship_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Authorship_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "dueDate" DATETIME,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAssignment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "score" REAL,
    "originality" REAL,
    "methodology" REAL,
    "relevance" REAL,
    "clarity" REAL,
    "overallScore" REAL,
    "normalizedZScore" REAL,
    "coiDeclared" BOOLEAN DEFAULT false,
    "recommendation" TEXT,
    "comment" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReviewAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT,
    "decidedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "floor" TEXT,
    CONSTRAINT "ProgramRoom_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "roomId" TEXT,
    "trackId" TEXT,
    "submissionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TALK',
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "capacity" INTEGER,
    "accessRule" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "cmeCredits" REAL,
    CONSTRAINT "ProgramSession_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ProgramRoom" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgramSession_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgramSession_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "participationId" TEXT,
    "personId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SPEAKER',
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "notes" TEXT,
    CONSTRAINT "ProgramAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgramSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramAssignment_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BadgeProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessAreas" TEXT,
    "color" TEXT,
    "designId" TEXT,
    CONSTRAINT "BadgeProfile_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BadgeProfile_designId_fkey" FOREIGN KEY ("designId") REFERENCES "BadgeDesign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BadgeInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participationId" TEXT NOT NULL,
    "profileId" TEXT,
    "badgeNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "issuedAt" DATETIME,
    "printedAt" DATETIME,
    "voidReason" TEXT,
    "reprintCount" INTEGER NOT NULL DEFAULT 0,
    "lastReprintReason" TEXT,
    CONSTRAINT "BadgeInstance_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BadgeInstance_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BadgeProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participationId" TEXT NOT NULL,
    "badgeId" TEXT,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QR',
    "accessProfile" TEXT,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "Credential_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Credential_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "BadgeInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT,
    "participationId" TEXT,
    "credentialId" TEXT,
    "personId" TEXT,
    "sessionId" TEXT,
    "location" TEXT NOT NULL DEFAULT 'MAIN_DOOR',
    "doorName" TEXT,
    "action" TEXT NOT NULL DEFAULT 'ENTRY',
    "result" TEXT NOT NULL DEFAULT 'ALLOWED',
    "reason" TEXT,
    "device" TEXT,
    "operator" TEXT,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanEvent_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScanEvent_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScanEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgramSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScanEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "eligibilityRule" TEXT,
    "minimumSessions" INTEGER,
    "signerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "widthMm" REAL NOT NULL DEFAULT 297,
    "heightMm" REAL NOT NULL DEFAULT 210,
    "bleedMm" REAL NOT NULL DEFAULT 0,
    "orientation" TEXT NOT NULL DEFAULT 'LANDSCAPE',
    "backgroundDataUrl" TEXT,
    "fontKey" TEXT NOT NULL DEFAULT 'serif',
    "textColor" TEXT NOT NULL DEFAULT '1f2937',
    "bodyTemplate" TEXT,
    "tierNote" TEXT,
    "mailDeliveredCount" INTEGER NOT NULL DEFAULT 0,
    "designJson" TEXT,
    CONSTRAINT "CertificateDefinition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "eligibilityNote" TEXT,
    "generatedAt" DATETIME,
    "deliveredAt" DATETIME,
    "revokedReason" TEXT,
    CONSTRAINT "CertificateIssue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CertificateDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CertificateIssue_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoothUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sizeSqm" REAL NOT NULL DEFAULT 12,
    "type" TEXT NOT NULL DEFAULT 'SHELL_SCHEME',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "optionExpiresAt" DATETIME,
    CONSTRAINT "BoothUnit_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BoothAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boothUnitId" TEXT NOT NULL,
    "agreementId" TEXT,
    "organizationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "BoothAllocation_boothUnitId_fkey" FOREIGN KEY ("boothUnitId") REFERENCES "BoothUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoothAllocation_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoothAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FloorPlanObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boothUnitId" TEXT,
    "label" TEXT,
    "x" REAL NOT NULL DEFAULT 0,
    "y" REAL NOT NULL DEFAULT 0,
    "width" REAL NOT NULL DEFAULT 4,
    "height" REAL NOT NULL DEFAULT 3,
    "rotation" REAL NOT NULL DEFAULT 0,
    "layer" TEXT NOT NULL DEFAULT 'BOOTH',
    CONSTRAINT "FloorPlanObject_boothUnitId_fkey" FOREIGN KEY ("boothUnitId") REFERENCES "BoothUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segmentRule" TEXT NOT NULL,
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "phase" TEXT NOT NULL DEFAULT 'PRE_EVENT',
    "audienceMode" TEXT NOT NULL DEFAULT 'SEGMENT',
    "customRecipients" TEXT,
    "templateId" TEXT,
    "providerId" TEXT,
    "formId" TEXT,
    "isSegmentFixed" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body" TEXT,
    "testSentTo" TEXT,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "channels" TEXT,
    "audienceJson" TEXT,
    "lastSendReport" TEXT,
    CONSTRAINT "Campaign_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Campaign_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MailProviderConfig" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Campaign_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "sourceEditionId" TEXT,
    "personId" TEXT,
    "organizationId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PERSON',
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "title" TEXT,
    "city" TEXT,
    "country" TEXT,
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "tags" TEXT,
    "notes" TEXT,
    "commsOptIn" BOOLEAN NOT NULL DEFAULT true,
    "lastEmailAt" DATETIME,
    "lastSmsAt" DATETIME,
    "lastWhatsAppAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerContact_sourceEditionId_fkey" FOREIGN KEY ("sourceEditionId") REFERENCES "EventEdition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL DEFAULT 'OPERATIONS',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPANY',
    "leaderId" TEXT,
    "billingOrganizationId" TEXT,
    "paymentAccount" TEXT,
    "rules" TEXT,
    CONSTRAINT "Delegation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Delegation_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Delegation_billingOrganizationId_fkey" FOREIGN KEY ("billingOrganizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DelegationMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "delegationId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    CONSTRAINT "DelegationMember_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DelegationMember_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Companion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ADULT',
    "notes" TEXT,
    CONSTRAINT "Companion_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "editionId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "hierarchyLevel" INTEGER NOT NULL DEFAULT 50,
    "permissions" TEXT,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomRole_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CvEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EXPERIENCE',
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "city" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CvEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CvEntry_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SLIDES',
    "title" TEXT NOT NULL,
    "personId" TEXT,
    "participationId" TEXT,
    "url" TEXT,
    "dataUrl" TEXT,
    "mimeType" TEXT,
    "sizeKb" INTEGER,
    "durationMin" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionMaterial_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgramSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionMaterial_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionMaterial_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionMaterial_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "EventParticipation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "systemKey" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFolder_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'IMAGE',
    "mimeType" TEXT,
    "sizeKb" INTEGER,
    "externalUrl" TEXT,
    "dataUrl" TEXT,
    "thumbDataUrl" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "tags" TEXT,
    "notes" TEXT,
    "linkedType" TEXT,
    "linkedId" TEXT,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JurisdictionProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'TR',
    "dsrSlaDays" INTEGER NOT NULL DEFAULT 30,
    "breachWindowHours" INTEGER NOT NULL DEFAULT 72,
    "opLogYears" INTEGER NOT NULL DEFAULT 3,
    "consentVersion" TEXT,
    "cookieStrictness" TEXT NOT NULL DEFAULT 'STRICT',
    "dpoMode" BOOLEAN NOT NULL DEFAULT false,
    "transferMechanism" TEXT NOT NULL DEFAULT 'BOARD_AUTHORIZATION',
    "retentionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JurisdictionProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "externalUrl" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supersededBy" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentRecord_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'TRIAL',
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "priceMonthlyMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "periodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" DATETIME,
    "trialQuotaBytes" INTEGER NOT NULL DEFAULT 524288000,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" DATETIME,
    "paidAt" DATETIME,
    "dueAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'BOTH',
    "type" TEXT NOT NULL DEFAULT 'ANNOUNCEMENT',
    "title" TEXT NOT NULL,
    "payloadJson" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalBlock_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "kind" TEXT NOT NULL DEFAULT 'REST',
    "provider" TEXT,
    "baseUrl" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "authConfig" TEXT,
    "inboundToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiIntegration_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "integrationId" TEXT,
    "editionId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "method" TEXT,
    "endpoint" TEXT,
    "statusCode" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "summary" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ApiIntegration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'INFORMATION',
    "phase" TEXT NOT NULL DEFAULT 'PRE_EVENT',
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailTemplate_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SMTP',
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "password" TEXT,
    "passwordCipher" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "dailyLimit" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastTestAt" DATETIME,
    "lastTestStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailSuppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailSuppression_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BadgeDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthMm" REAL NOT NULL DEFAULT 105,
    "heightMm" REAL NOT NULL DEFAULT 148,
    "bleedMm" REAL NOT NULL DEFAULT 3,
    "cornerMm" REAL NOT NULL DEFAULT 4,
    "sideCount" INTEGER NOT NULL DEFAULT 1,
    "fontKey" TEXT NOT NULL DEFAULT 'inter',
    "frontBackgroundDataUrl" TEXT,
    "backBackgroundDataUrl" TEXT,
    "frontElements" TEXT,
    "backElements" TEXT,
    "qrSource" TEXT NOT NULL DEFAULT 'CREDENTIAL',
    "sponsorHierarchyKey" TEXT,
    "showProgramOnBack" BOOLEAN NOT NULL DEFAULT false,
    "backContactInfo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadgeDesign_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SOCIAL',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "venue" TEXT,
    "meetingPoint" TEXT,
    "capacity" INTEGER,
    "price" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialPlan_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialPlanAnnouncement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "personId" TEXT,
    "fullName" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "message" TEXT,
    "response" TEXT,
    "respondedAt" DATETIME,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialPlanAnnouncement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SocialPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialPlanAnnouncement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "B2bPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "venue" TEXT,
    "location" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "B2bPlan_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "B2bAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "organizerApproved" BOOLEAN NOT NULL DEFAULT false,
    "personApproved" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "feedbackAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "B2bAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "B2bPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "B2bAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationChannelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "channelsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "waEnabled" BOOLEAN NOT NULL DEFAULT false,
    "waProvider" TEXT,
    "waEndpoint" TEXT,
    "waPhoneId" TEXT,
    "waAccountId" TEXT,
    "waFrom" TEXT,
    "waTokenCipher" TEXT,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT,
    "smsEndpoint" TEXT,
    "smsSenderId" TEXT,
    "smsFrom" TEXT,
    "smsAccountId" TEXT,
    "smsTokenCipher" TEXT,
    "eventsJson" TEXT,
    "lastTestAt" DATETIME,
    "lastTestStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationChannelConfig_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "personId" TEXT,
    "organizationId" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    CONSTRAINT "PortalToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalToken_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventPortalConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "countdownTo" DATETIME,
    "eventCode" TEXT,
    "allowRegistrationRedirect" BOOLEAN NOT NULL DEFAULT true,
    "registrationFormId" TEXT,
    "portalLogoUrl" TEXT,
    "portalBannerUrl" TEXT,
    "themeColor" TEXT,
    "headerEventsJson" TEXT,
    "bottomNavJson" TEXT,
    "widgetsJson" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyOffsetsJson" TEXT,
    "sponsorIdsJson" TEXT,
    "venueMapUrl" TEXT,
    "venueMapEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fontFamily" TEXT,
    "fontScale" INTEGER,
    "headerBgColor" TEXT,
    "footerBgColor" TEXT,
    "contentBgColor" TEXT,
    "headerBgImage" TEXT,
    "footerBgImage" TEXT,
    "contentBgImage" TEXT,
    "portalSponsorLogoUrl" TEXT,
    "portalSponsorName" TEXT,
    "portalSponsorUrl" TEXT,
    "iconOverridesJson" TEXT,
    "iconLayoutJson" TEXT,
    "chromeJson" TEXT,
    "gameEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gameConfigJson" TEXT,
    "pwaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventPortalConfig_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalGameProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "actionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalGameProgress_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "personId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalSession_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalSession_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalAnalyticsLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "widgetKey" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAnalyticsLog_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalAnalyticsLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PortalSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalAnnouncement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "target" TEXT NOT NULL DEFAULT 'ALL',
    "sentBy" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAnnouncement_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "sessionId" TEXT,
    "programSessionId" TEXT,
    "body" TEXT NOT NULL,
    "displayName" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "answerBody" TEXT,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalQuestion_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PortalSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PortalQuestion_programSessionId_fkey" FOREIGN KEY ("programSessionId") REFERENCES "ProgramSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalSessionRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'TEXT',
    "optionsJson" TEXT,
    "defaultValue" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "groupName" TEXT,
    "visibilityRulesJson" TEXT,
    "tenantId" TEXT,
    "editionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "textValue" TEXT,
    "numValue" REAL,
    "boolValue" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AgencyGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "agencyOrganizationId" TEXT NOT NULL,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactEmail" TEXT NOT NULL,
    "primaryContactPhone" TEXT,
    "invoiceId" TEXT,
    "totalQuota" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EventPersonRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleCategory" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "KvkkErasureRequest_tenantId_idx" ON "KvkkErasureRequest"("tenantId");

-- CreateIndex
CREATE INDEX "KvkkErasureRequest_status_idx" ON "KvkkErasureRequest"("status");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Person_lastName_idx" ON "Person"("lastName");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_slug_key" ON "EventSeries"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "EventEdition_slug_key" ON "EventEdition"("slug");

-- CreateIndex
CREATE INDEX "EventEdition_status_idx" ON "EventEdition"("status");

-- CreateIndex
CREATE INDEX "EventEdition_startDate_idx" ON "EventEdition"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "EventCapability_editionId_key_key" ON "EventCapability"("editionId", "key");

-- CreateIndex
CREATE INDEX "EventOrganizationAssignment_editionId_idx" ON "EventOrganizationAssignment"("editionId");

-- CreateIndex
CREATE INDEX "EventParticipation_attendance_idx" ON "EventParticipation"("attendance");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipation_editionId_personId_key" ON "EventParticipation"("editionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_confirmationNo_key" ON "Registration"("confirmationNo");

-- CreateIndex
CREATE INDEX "Registration_editionId_idx" ON "Registration"("editionId");

-- CreateIndex
CREATE INDEX "Registration_status_idx" ON "Registration"("status");

-- CreateIndex
CREATE INDEX "Registration_editionId_status_idx" ON "Registration"("editionId", "status");

-- CreateIndex
CREATE INDEX "Registration_editionId_categoryId_idx" ON "Registration"("editionId", "categoryId");

-- CreateIndex
CREATE INDEX "RegistrationCategory_editionId_idx" ON "RegistrationCategory"("editionId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_editionId_status_idx" ON "WaitlistEntry"("editionId", "status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_categoryId_status_idx" ON "WaitlistEntry"("categoryId", "status");

-- CreateIndex
CREATE INDEX "EventRoleAssignment_participationId_idx" ON "EventRoleAssignment"("participationId");

-- CreateIndex
CREATE INDEX "Invitation_editionId_idx" ON "Invitation"("editionId");

-- CreateIndex
CREATE INDEX "Invitation_status_idx" ON "Invitation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinition_slug_key" ON "FormDefinition"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_registrationId_key" ON "FormSubmission"("registrationId");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_idx" ON "FormSubmission"("formId");

-- CreateIndex
CREATE INDEX "FormSubmission_status_idx" ON "FormSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_code_key" ON "Expense"("code");

-- CreateIndex
CREATE INDEX "Expense_editionId_idx" ON "Expense"("editionId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Income_code_key" ON "Income"("code");

-- CreateIndex
CREATE INDEX "Income_editionId_idx" ON "Income"("editionId");

-- CreateIndex
CREATE INDEX "Income_status_idx" ON "Income"("status");

-- CreateIndex
CREATE INDEX "Income_category_idx" ON "Income"("category");

-- CreateIndex
CREATE INDEX "Entitlement_editionId_idx" ON "Entitlement"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_editionId_idx" ON "Order"("editionId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_orderId_idempotencyKey_key" ON "Refund"("orderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SponsorAgreement_editionId_idx" ON "SponsorAgreement"("editionId");

-- CreateIndex
CREATE INDEX "SponsorAgreement_status_idx" ON "SponsorAgreement"("status");

-- CreateIndex
CREATE INDEX "Deliverable_agreementId_idx" ON "Deliverable"("agreementId");

-- CreateIndex
CREATE INDEX "HotelProperty_editionId_idx" ON "HotelProperty"("editionId");

-- CreateIndex
CREATE INDEX "RoomBlock_hotelId_idx" ON "RoomBlock"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryNight_blockId_date_key" ON "InventoryNight"("blockId", "date");

-- CreateIndex
CREATE INDEX "Reservation_editionId_idx" ON "Reservation"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScientificSetup_editionId_key" ON "ScientificSetup"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_code_key" ON "Submission"("code");

-- CreateIndex
CREATE INDEX "Submission_editionId_idx" ON "Submission"("editionId");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "Authorship_submissionId_idx" ON "Authorship"("submissionId");

-- CreateIndex
CREATE INDEX "ReviewAssignment_submissionId_idx" ON "ReviewAssignment"("submissionId");

-- CreateIndex
CREATE INDEX "Decision_submissionId_idx" ON "Decision"("submissionId");

-- CreateIndex
CREATE INDEX "ProgramSession_editionId_idx" ON "ProgramSession"("editionId");

-- CreateIndex
CREATE INDEX "ProgramAssignment_sessionId_idx" ON "ProgramAssignment"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeInstance_badgeNo_key" ON "BadgeInstance"("badgeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_code_key" ON "Credential"("code");

-- CreateIndex
CREATE INDEX "ScanEvent_scannedAt_idx" ON "ScanEvent"("scannedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_participationId_idx" ON "ScanEvent"("participationId");

-- CreateIndex
CREATE INDEX "ScanEvent_participationId_action_result_idx" ON "ScanEvent"("participationId", "action", "result");

-- CreateIndex
CREATE INDEX "ScanEvent_editionId_scannedAt_idx" ON "ScanEvent"("editionId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateIssue_definitionId_participationId_key" ON "CertificateIssue"("definitionId", "participationId");

-- CreateIndex
CREATE INDEX "BoothUnit_editionId_idx" ON "BoothUnit"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "BoothAllocation_boothUnitId_key" ON "BoothAllocation"("boothUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlanObject_boothUnitId_key" ON "FloorPlanObject"("boothUnitId");

-- CreateIndex
CREATE INDEX "Campaign_editionId_idx" ON "Campaign"("editionId");

-- CreateIndex
CREATE INDEX "CustomerContact_tenantId_idx" ON "CustomerContact"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerContact_sourceEditionId_idx" ON "CustomerContact"("sourceEditionId");

-- CreateIndex
CREATE INDEX "CustomerContact_personId_idx" ON "CustomerContact"("personId");

-- CreateIndex
CREATE INDEX "Task_editionId_idx" ON "Task"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegationMember_delegationId_participationId_key" ON "DelegationMember"("delegationId", "participationId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_editionId_createdAt_idx" ON "ActivityLog"("editionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_editionId_key_key" ON "CustomRole"("editionId", "key");

-- CreateIndex
CREATE INDEX "CvEntry_personId_idx" ON "CvEntry"("personId");

-- CreateIndex
CREATE INDEX "SessionMaterial_sessionId_idx" ON "SessionMaterial"("sessionId");

-- CreateIndex
CREATE INDEX "MediaFolder_editionId_idx" ON "MediaFolder"("editionId");

-- CreateIndex
CREATE INDEX "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");

-- CreateIndex
CREATE INDEX "MediaAsset_editionId_idx" ON "MediaAsset"("editionId");

-- CreateIndex
CREATE INDEX "MediaAsset_folderId_idx" ON "MediaAsset"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionProfile_tenantId_key" ON "JurisdictionProfile"("tenantId");

-- CreateIndex
CREATE INDEX "DocumentRecord_tenantId_kind_active_idx" ON "DocumentRecord"("tenantId", "kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvoice_number_key" ON "TenantInvoice"("number");

-- CreateIndex
CREATE INDEX "TenantInvoice_subscriptionId_idx" ON "TenantInvoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "PortalBlock_editionId_isVisible_idx" ON "PortalBlock"("editionId", "isVisible");

-- CreateIndex
CREATE UNIQUE INDEX "ApiIntegration_inboundToken_key" ON "ApiIntegration"("inboundToken");

-- CreateIndex
CREATE INDEX "ApiIntegration_tenantId_idx" ON "ApiIntegration"("tenantId");

-- CreateIndex
CREATE INDEX "ApiIntegration_status_idx" ON "ApiIntegration"("status");

-- CreateIndex
CREATE INDEX "IntegrationLog_createdAt_idx" ON "IntegrationLog"("createdAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_integrationId_idx" ON "IntegrationLog"("integrationId");

-- CreateIndex
CREATE INDEX "EmailTemplate_editionId_idx" ON "EmailTemplate"("editionId");

-- CreateIndex
CREATE INDEX "MailProviderConfig_tenantId_idx" ON "MailProviderConfig"("tenantId");

-- CreateIndex
CREATE INDEX "MailSuppression_tenantId_idx" ON "MailSuppression"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MailSuppression_tenantId_email_key" ON "MailSuppression"("tenantId", "email");

-- CreateIndex
CREATE INDEX "BadgeDesign_editionId_idx" ON "BadgeDesign"("editionId");

-- CreateIndex
CREATE INDEX "SocialPlan_editionId_idx" ON "SocialPlan"("editionId");

-- CreateIndex
CREATE INDEX "SocialPlan_kind_idx" ON "SocialPlan"("kind");

-- CreateIndex
CREATE INDEX "SocialPlanAnnouncement_planId_idx" ON "SocialPlanAnnouncement"("planId");

-- CreateIndex
CREATE INDEX "SocialPlanAnnouncement_personId_idx" ON "SocialPlanAnnouncement"("personId");

-- CreateIndex
CREATE INDEX "B2bPlan_editionId_idx" ON "B2bPlan"("editionId");

-- CreateIndex
CREATE INDEX "B2bPlan_status_idx" ON "B2bPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "B2bPlan_editionId_startsAt_location_key" ON "B2bPlan"("editionId", "startsAt", "location");

-- CreateIndex
CREATE INDEX "B2bAssignment_planId_idx" ON "B2bAssignment"("planId");

-- CreateIndex
CREATE INDEX "B2bAssignment_personId_idx" ON "B2bAssignment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "B2bAssignment_planId_personId_key" ON "B2bAssignment"("planId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannelConfig_editionId_key" ON "NotificationChannelConfig"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalToken_tokenHash_key" ON "PortalToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalToken_personId_idx" ON "PortalToken"("personId");

-- CreateIndex
CREATE INDEX "PortalToken_organizationId_idx" ON "PortalToken"("organizationId");

-- CreateIndex
CREATE INDEX "PortalToken_editionId_idx" ON "PortalToken"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPortalConfig_editionId_key" ON "EventPortalConfig"("editionId");

-- CreateIndex
CREATE INDEX "PortalGameProgress_editionId_points_idx" ON "PortalGameProgress"("editionId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "PortalGameProgress_editionId_sessionId_key" ON "PortalGameProgress"("editionId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_editionId_idx" ON "PortalSession"("editionId");

-- CreateIndex
CREATE INDEX "PortalSession_personId_idx" ON "PortalSession"("personId");

-- CreateIndex
CREATE INDEX "PortalAnalyticsLog_editionId_kind_idx" ON "PortalAnalyticsLog"("editionId", "kind");

-- CreateIndex
CREATE INDEX "PortalAnalyticsLog_createdAt_idx" ON "PortalAnalyticsLog"("createdAt");

-- CreateIndex
CREATE INDEX "PortalAnnouncement_editionId_createdAt_idx" ON "PortalAnnouncement"("editionId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalQuestion_editionId_status_idx" ON "PortalQuestion"("editionId", "status");

-- CreateIndex
CREATE INDEX "PortalSessionRegistration_editionId_personId_idx" ON "PortalSessionRegistration"("editionId", "personId");

-- CreateIndex
CREATE INDEX "PortalSessionRegistration_sessionId_idx" ON "PortalSessionRegistration"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSessionRegistration_sessionId_personId_key" ON "PortalSessionRegistration"("sessionId", "personId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_entityType_editionId_idx" ON "CustomFieldDefinition"("entityType", "editionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_entityType_key_editionId_key" ON "CustomFieldDefinition"("entityType", "key", "editionId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_entityId_idx" ON "CustomFieldValue"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_definitionId_entityId_key" ON "CustomFieldValue"("definitionId", "entityId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgencyGroup_editionId_idx" ON "AgencyGroup"("editionId");

-- CreateIndex
CREATE INDEX "AgencyGroup_agencyOrganizationId_idx" ON "AgencyGroup"("agencyOrganizationId");

-- CreateIndex
CREATE INDEX "EventPersonRole_editionId_personId_idx" ON "EventPersonRole"("editionId", "personId");

-- CreateIndex
CREATE INDEX "EventPersonRole_roleName_idx" ON "EventPersonRole"("roleName");

-- CreateIndex
CREATE UNIQUE INDEX "EventPersonRole_editionId_personId_roleName_key" ON "EventPersonRole"("editionId", "personId", "roleName");

