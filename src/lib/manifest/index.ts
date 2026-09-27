import { DomainEntityManifest } from "./types";
import { RegistrationManifest } from "./entities/registrations.manifest";
import { PeopleManifest } from "./entities/people.manifest";
import { SessionManifest } from "./entities/sessions.manifest";
import { AccommodationManifest } from "./entities/accommodation.manifest";
import { BoothManifest } from "./entities/booths.manifest";
import { AccountingManifest } from "./entities/accounting.manifest";
import { SponsorshipManifest } from "./entities/sponsorship.manifest";

export const DOMAIN_MANIFESTS: Record<string, DomainEntityManifest> = {
  registrations: RegistrationManifest,
  people: PeopleManifest,
  sessions: SessionManifest,
  accommodation: AccommodationManifest,
  floors: BoothManifest,
  accounting: AccountingManifest,
  sponsorship: SponsorshipManifest,
};

export function getManifest(entityId: string): DomainEntityManifest | undefined {
  return DOMAIN_MANIFESTS[entityId];
}

export function getAllManifests(): DomainEntityManifest[] {
  return Object.values(DOMAIN_MANIFESTS);
}

export * from "./types";
