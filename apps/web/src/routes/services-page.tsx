/** What the wallet can buy: fixed prices, a request, and the results to come back to. */

import type { ReactElement } from "react";

import { Page } from "../components/nav/page";
import { ServiceBrowser } from "../components/services/service-browser";

export const ServicesPage = (): ReactElement => (
  <Page
    intro="Fixed prices, paid from your wallet, with a result you can come back to."
    title="Services"
  >
    <ServiceBrowser />
  </Page>
);
