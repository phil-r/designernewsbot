import { installNetworkPolicy } from './network-policy';

// Every application-loading subprocess has an independent fail-closed guard.
installNetworkPolicy();
