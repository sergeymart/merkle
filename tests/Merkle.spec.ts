import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Builder, Cell, toNano } from '@ton/core'
import { CheckParams, Merkle } from '../wrappers/Merkle'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { randomAddress } from '@ton/test-utils'
import { MerkleTree } from 'merkletreejs'
import * as fs from 'node:fs'

jest.setTimeout(1000000)

type Leaf = { address: string, amount: string, hash: string }

const cellHash = (data: Buffer) => beginCell().storeBuffer(data).endCell().hash()
const filename = 'data.json'

const packProof = (items: Array<{ position: 'right' | 'left', data: Buffer }>) => {
  let curRoot = beginCell()
  const refsList: Builder[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    curRoot
      .storeBit(item.position === 'right' ? 1 : 0)
      .storeBuffer(item.data, 32)

    if (curRoot.bits >= 257 * 3) {
      refsList.push(curRoot)
      curRoot = beginCell()
    }
  }
  refsList.push()
  const root = [...refsList, curRoot].reduceRight((child, parent) => parent.storeRef(child))
  return root.endCell()
}

describe('Merkle', () => {
  let code: Cell
  let leaves: Array<Leaf> = []
  let tree: MerkleTree
  let checkNum = 100

  beforeAll(async () => {
    code = await compile('Merkle')
    console.time('Generate data')

    if (fs.existsSync(filename)) {
      leaves = JSON.parse(fs.readFileSync(filename).toString())
    } else {
      const num = 600000
      for (let i = 0; i < num; i++) {

        const address = randomAddress()
        const amount = BigInt(Math.floor(Math.random() * 1e12))

        const hash = beginCell()
          .storeAddress(address)
          .storeCoins(amount)
          .endCell()
          .hash()

        const leaf: Leaf = {
          address: address.toString(),
          amount: amount.toString(),
          hash: hash.toString('hex'),
        }

        leaves.push(leaf)
      }
      fs.writeFileSync(filename, JSON.stringify(leaves))
    }
    console.timeEnd('Generate data')

    console.time('Merkle tree')
    tree = new MerkleTree(leaves.map(l => l.hash), (data: Buffer) => cellHash(data))
    console.timeEnd('Merkle tree')

    checkNum = leaves.length < 100 ? leaves.length : 100
  })

  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let merkle: SandboxContract<Merkle>

  beforeAll(async () => {
    blockchain = await Blockchain.create()

    merkle = blockchain.openContract(Merkle.createFromConfig({
      root: tree.getRoot(),
    }, code))
    deployer = await blockchain.treasury('deployer')

    const deployResult = await merkle.sendDeploy(deployer.getSender(), toNano('0.05'))
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: merkle.address,
      deploy: true,
      success: true,
    })
  })

  it(`Should fail verification`, async () => {
    const item = leaves[1]
    const proof = packProof(tree.getProof(item.hash))

    const params: CheckParams = {
      entity: beginCell().storeAddress(randomAddress()).storeCoins(BigInt(item.amount)).endCell(),
      proof: proof,
    }

    const res = await merkle.sendCheck(deployer.getSender(), toNano(1), params)
    expect(res.transactions).toHaveTransaction({ exitCode: 2222 })
  })

  it(`Check proof for ${checkNum} addresses}`, async () => {
    console.time(`Check`)
    for (let i = 0; i < checkNum; i++) {
      const idx = Math.floor(Math.random() * leaves.length)

      const item = leaves[idx]
      const proof = packProof(tree.getProof(item.hash))

      const params: CheckParams = {
        entity: beginCell().storeAddress(Address.parse(item.address)).storeCoins(BigInt(item.amount)).endCell(),
        proof: proof,
      }

      const res = await merkle.sendCheck(deployer.getSender(), toNano(1), params)
      expect(res.transactions).toHaveTransaction({ exitCode: 666 })
      // printTransactionFees(res.transactions)
    }
    console.timeEnd('Check')
  })
})
