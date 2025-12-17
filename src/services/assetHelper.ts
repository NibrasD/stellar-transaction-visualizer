const domainCache = new Map<string, string>();

export async function getIssuerDomain(assetIssuer: string, networkUrl: string): Promise<string | null> {
  if (!assetIssuer || assetIssuer === 'native') {
    return 'stellar.org';
  }

  if (domainCache.has(assetIssuer)) {
    return domainCache.get(assetIssuer) || null;
  }

  const knownIssuers: { [key: string]: string } = {
    'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN': 'centre.io',
    'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG': 'ultracapital.xyz',
    'GBDEVU63Y6NTHJQQZIKVTC23NWLQVP3WJ2RI2OTSJTNYOIGICST6DUXR': 'aqua.network',
    'GDZKAGVXRLBR4MNBWGQZ5YGVJQKFVVHQ7RTDVQ4XUTW7GUXNC6XNVQBE': 'ultracapital.xyz',
    'GDUKMGUGDZQK6YHYA5Z6AY2G4XDSZPSZ3SW5UN3ARVMO6QSRDWP5YLEX': 'ultrastellar.com',
    'GBBM6BKZPEHWYO3E3YKREDPQXMS4VK35YLNU7NFBRI26RAN7GI5POFBB': 'stellar.expert',
    'GATEMHCCKCY67ZUCKTROYN24ZYT5GK4EQZ65JJLDHKHRUZI3EUEKMTCH': 'apay.io',
    'GCQVEST7KIWV3KOSNDDUJKEPZLBFWKM7DUS4TCLW2VNVPCBGTDRVTEIT': 'mykobo.co',
    'GCZYLNGU4CA5NAWBAVTHMZS4JEENICBP5JWFJQMFZA3QS5SQBCWLZOZ3': 'aqua.network',
    'GDM4UWTGHCWSTM7Z46PNF4BLH35GS6IUZYBWNNI4VU5KVIHYSIVQ55Y6': 'velo.org',
  };

  if (knownIssuers[assetIssuer]) {
    const domain = knownIssuers[assetIssuer];
    domainCache.set(assetIssuer, domain);
    return domain;
  }

  try {
    const response = await fetch(`${networkUrl}/accounts/${assetIssuer}`, {
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const homeDomain = data.home_domain;

    if (homeDomain) {
      domainCache.set(assetIssuer, homeDomain);
      return homeDomain;
    }
  } catch (error) {
    return null;
  }

  return null;
}

export function formatAssetWithDomain(
  assetType: string,
  assetCode?: string,
  assetIssuer?: string,
  domain?: string
): string {
  if (assetType === 'native') return 'XLM(stellar.org)';
  if (!assetCode) return 'Unknown Asset';

  if (domain) {
    return `${assetCode}(${domain})`;
  }

  if (assetIssuer) {
    const shortIssuer = `${assetIssuer.substring(0, 4)}…${assetIssuer.substring(assetIssuer.length - 4)}`;
    return `${assetCode}(${shortIssuer})`;
  }

  return assetCode;
}

export function formatAsset(assetType: string, assetCode?: string, assetIssuer?: string): string {
  if (assetType === 'native') return 'XLM';
  if (assetCode) return assetCode;
  return 'Unknown Asset';
}
