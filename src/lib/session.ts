import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * Request-cached session lookup.
 *
 * Auth.js uses database sessions, so every `auth()` call costs a query. The
 * layout (navbar) and the page both need the session, so cache it per request
 * to avoid paying for it twice.
 */
export const getSession = cache(async () => auth());
