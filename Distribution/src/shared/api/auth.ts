import { useFrappeGetCall } from "frappe-react-sdk";
import type { DistributionUser } from "@/shared/types/distribution";

interface FrappeMessage<T> { message: T }

export function useDistributionUser(currentUser?: string | null) {
  return useFrappeGetCall<FrappeMessage<DistributionUser>>(
    "log.api.distribution.get_current_distribution_user",
    undefined,
    currentUser ? `distribution-user-${currentUser}` : null,
  );
}
