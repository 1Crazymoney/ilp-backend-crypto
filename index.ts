import BigNumber from 'bignumber.js'
import { AccountInfo } from 'ilp-connector/src/types/accounts'
import {
  BackendInstance,
  BackendServices
} from 'ilp-connector/src/types/backend'
import { RateApi, connectCoinCap } from 'crypto-rate-utils'

import { create as createLogger } from 'ilp-connector/src/common/log'
const log = createLogger('crypto-backend')

export interface BackendOpts {
  spread?: BigNumber.Value
  createApi: () => Promise<RateApi>
}

export default class Backend implements BackendInstance {
  protected spread: BigNumber

  protected createApi: () => Promise<RateApi>
  protected api?: RateApi

  protected getInfo: (accountId: string) => AccountInfo | undefined

  constructor(
    { spread = 0, createApi = connectCoinCap }: BackendOpts,
    { getInfo }: BackendServices
  ) {
    this.spread = new BigNumber(spread)
    this.createApi = createApi

    this.getInfo = getInfo
  }

  public async connect() {
    this.api = await this.createApi()
  }

  public async getRate(sourceAccount: string, destinationAccount: string) {
    if (!this.api) {
      log.error('not connected to backend api.')
      throw new Error('not connected to the backend api.')
    }

    const sourceInfo = this.getInfo(sourceAccount)
    if (!sourceInfo) {
      log.error(
        'unable to fetch account info for source account. accountId=%s',
        sourceAccount
      )
      throw new Error(
        `unable to fetch account info for source account. accountId=${sourceAccount}`
      )
    }

    const destInfo = this.getInfo(destinationAccount)
    if (!destInfo) {
      log.error(
        'unable to fetch account info for destination account. accountId=%s',
        destinationAccount
      )
      throw new Error(
        `unable to fetch account info for destination account. accountId=${destinationAccount}`
      )
    }

    const { assetCode: sourceSymbol, assetScale: sourceScale } = sourceInfo
    const { assetCode: destSymbol, assetScale: destScale } = destInfo

    const [sourcePrice, destPrice] = await Promise.all([
      this.api.getPrice(sourceSymbol),
      this.api.getPrice(destSymbol)
    ])

    return sourcePrice
      .div(destPrice)
      .shiftedBy(destScale - sourceScale)
      .times(new BigNumber(1).minus(this.spread))
      .precision(15, BigNumber.ROUND_DOWN)
      .toNumber()
  }

  // No-op since there's no statistics to be collected
  public async submitPayment() {
    return
  }

  public async disconnect() {
    if (this.api) {
      this.api.disconnect()
      delete this.api
    }
  }
}
