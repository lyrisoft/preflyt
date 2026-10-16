import OriginalLinkItem from '@theme-original/Footer/LinkItem'
import type {Props} from '@theme/Footer/LinkItem'
import {useActiveDocContext} from '@docusaurus/plugin-content-docs/client'
import release from '../../../../release-config.json'

/** Keep documentation footer navigation in the version the reader selected. */
export default function FooterLinkItem({item}: Props) {
  const {activeVersion} = useActiveDocContext(undefined)
  const name = activeVersion?.name
  const prefix = name === 'current' ? '/next' : name && name !== release.latestStable ? `/${name}` : ''
  return <OriginalLinkItem item={item.to ? {...item, to: `${prefix}${item.to}`} : item} />
}
