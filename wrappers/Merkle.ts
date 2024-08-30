import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core'

export type MerkleConfig = { root: Buffer }

export type CheckParams = { entity: Cell, proof: Cell }

export function merkleConfigToCell(config: MerkleConfig): Cell {
  return beginCell()
    .storeBuffer(config.root, 32)
    .endCell()
}

export class Merkle implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell, data: Cell }) {}

  static createFromAddress(address: Address) {
    return new Merkle(address)
  }

  static createFromConfig(config: MerkleConfig, code: Cell, workchain = 0) {
    const data = merkleConfigToCell(config)
    const init = { code, data }
    return new Merkle(contractAddress(workchain, init), init)
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    })
  }

  async sendCheck(provider: ContractProvider, via: Sender, value: bigint, params: CheckParams) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeRef(params.entity)
        .storeRef(params.proof)
        .endCell(),
    })
  }
}
