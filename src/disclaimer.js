/**
 * The disclaimer copy both surfaces show: the plugin's settings page and the
 * standalone/desktop console.
 *
 * The product carries no WorkBuddy and no Huawei Cloud channel. Those two are
 * excluded mechanically (`src/magpie-policy.js`, and the aggregate registry
 * through it), but an exclusion with no explanation leaves a user wondering
 * whether the channel is broken. This copy answers the two questions that
 * matter instead: those channels are not part of what this build offers, and
 * anything a user does with a channel is their own responsibility.
 *
 * The copy is data, not markup: each surface renders it in its own idiom, so
 * there is exactly one place to change what the product says. It is deliberately
 * short — a wall of legal text is read by nobody — and states the project's
 * purpose plainly, because that is the honest description of what it is.
 */

export const DISCLAIMER_VERSION = 2

/** Channels this build does not offer, named for the reader. */
export const EXCLUDED_CHANNELS = Object.freeze([
  'WorkBuddy China edition (workbuddy, also known as CodeBuddy)',
  'WorkBuddy international edition (workbuddy-ai)',
  'Huawei Cloud MaaS (huaweicloud, including Token Plan)',
])

export const DISCLAIMER = Object.freeze({
  version: DISCLAIMER_VERSION,
  title: 'Terms of Use and Disclaimer',
  subtitle: 'About the channels this plugin does not offer, and the limits of responsibility you need to know',
  intro: 'This plugin is a personal learning and technical research project for studying how model gateways, protocol adaptation, and local routing are implemented. It is provided “as is” and does not constitute any commercial service or product commitment.',
  sections: Object.freeze([
    {
      id: 'excluded',
      heading: 'This plugin does not offer these three channels',
      body: 'This plugin does not include or offer the WorkBuddy China edition (workbuddy, also known as CodeBuddy), the WorkBuddy international edition (workbuddy-ai), or Huawei Cloud MaaS (huaweicloud, including Token Plan). All three have been removed from both the plugin and desktop versions: they do not appear in the channel list, presets, sign-in entry points, plugin marketplace, or model catalog, and cannot be enabled by importing a configuration or installing a third-party plugin. Their absence from the catalog is not a malfunction; it is a deliberate choice by this project, and future updates will not reintroduce them.',
    },
    {
      id: 'responsibility',
      heading: 'Use of third-party channels is unrelated to us',
      body: 'If you use the above channels or other third-party services in any way outside this plugin, including configuring addresses yourself, importing credentials, installing third-party software, or signing in to someone else\'s account, that is your personal conduct and is unrelated to the authors and team of this project. We are not involved in, do not endorse, and do not provide support for such use, and we accept no responsibility for its availability, compliance, or any consequences.',
    },
    {
      id: 'accounts',
      heading: 'You are responsible for your own accounts and credentials',
      body: 'This plugin only stores credentials you actively import on your local machine; it does not upload them to any server. Please ensure that the way you use these accounts complies with the terms of the corresponding service providers and the laws of your location; any resulting bans, charges, data risks, or other losses are borne by the user.',
    },
    {
      id: 'no-warranty',
      heading: 'No warranty of any kind',
      body: 'This project makes no express or implied warranty as to correctness, stability, merchantability, or fitness for a particular purpose. The authors and team accept no responsibility for any direct or indirect loss caused by using this plugin. Please assess the risks yourself, and prioritize compliance with the laws and regulations of your region and your service provider agreements.',
    },
    {
      id: 'lawful',
      heading: 'Please use it lawfully and compliantly',
      body: 'This project is for personal learning and technical research only. Do not use it to violate service provider terms, circumvent authorization limits, abuse quotas in bulk, or for other unlawful purposes. Any disputes, claims, or legal liability arising from improper use are borne by the user.',
    },
  ]),
  accept: 'I have read and understand',
  reopen: 'View disclaimer',
})

/** Whether a stored acknowledgement matches the current copy version. */
export function disclaimerAcknowledged(settings) {
  return Number(settings?.disclaimerAck) === DISCLAIMER_VERSION
}
