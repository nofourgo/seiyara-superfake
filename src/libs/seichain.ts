import { BigNumberish, ethers } from 'ethers';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { pubToAddress, toChecksumAddress } from 'ethereumjs-util';
import { assertIsDeliverTxSuccess, SigningStargateClient } from '@cosmjs/stargate';
import { GasPrice, coins, calculateFee } from '@cosmjs/stargate';
import { fromBech32 } from '@cosmjs/encoding';
import Decimal from 'decimal.js';
import { Bip39, EnglishMnemonic, Slip10, Slip10Curve } from '@cosmjs/crypto';
import { Slip10RawIndex } from '@cosmjs/crypto';
import { parseEther, formatEther } from 'ethers/lib/utils';
import logger from '../utils/logger';
import { REWARD_ONCHAIN_SEI } from '../services/achievementService';

// Usage of the SEI Chain
// import { checkin, purchase } from './seichain';

// // Perform a checkin with 0.1 SEI
// checkin('<your_private_key>', 0.1).then(console.log).catch(console.error);

// // Perform a purchase with 1 SEI
// purchase('<your_private_key>', 1).then(console.log).catch(console.error);

// Configuration for EVM SEI Contract Interaction
const CONTRACT_ADDRESS = process.env.PRODUCT_ADDRESS || '0x';
const EVM_RPC_URL = 'https://evm-rpc.sei-apis.com';
const ABI = ['function checkin() external payable', 'function purchase() external payable'];

const PROVIDER = new ethers.providers.JsonRpcProvider(EVM_RPC_URL);
const PROVIDER_WITH_TIMEOUT = new ethers.providers.JsonRpcProvider({ url: EVM_RPC_URL, timeout: 5000 });

function getProvider() {
    return PROVIDER;
}

function getProviderWithTimeout() {
    return PROVIDER_WITH_TIMEOUT;
}

export function getWallet(privateKey: string) {
    return new ethers.Wallet(privateKey, getProvider());
}

export function isValidSeiAddress(address: string): boolean {
    try {
        const decoded = fromBech32(address);
        return decoded.prefix === 'sei';
    } catch {
        return false;
    }
}

async function toEVMAddress(mnemonic: string): Promise<string> {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'sei' });
    const [account] = await wallet.getAccounts();
    const address = pubToAddress(Buffer.from(account.pubkey), true);
    return toChecksumAddress('0x' + address.toString('hex'));
}

async function toSEIAddress(mnemonic: string): Promise<string> {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'sei' });
    const [account] = await wallet.getAccounts();
    return account.address;
}

export async function createSeiWallet() {
    const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: 'sei' });
    const [account] = await wallet.getAccounts();
    const mnemonic = wallet.mnemonic;

    const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic));
    const masterKey = Slip10.derivePath(Slip10Curve.Secp256k1, seed, [
        Slip10RawIndex.hardened(44),
        Slip10RawIndex.hardened(118),
        Slip10RawIndex.hardened(0),
        Slip10RawIndex.normal(0),
        Slip10RawIndex.normal(0),
    ]);

    const privateKey = masterKey.privkey;
    const evmAddress = pubToAddress(Buffer.from(account.pubkey), true);

    // console.log({
    //     evmAddress: toChecksumAddress('0x' + evmAddress.toString('hex')),
    //     seiAddress: account.address,
    //     mnemonic: mnemonic,
    //     publicKey: Buffer.from(account.pubkey).toString('hex'),
    //     privateKey: Buffer.from(privateKey).toString('hex'),
    // });

    return {
        evmAddress: toChecksumAddress('0x' + evmAddress.toString('hex')),
        seiAddress: account.address,
        mnemonic: mnemonic,
        publicKey: Buffer.from(account.pubkey).toString('hex'),
        privateKey: Buffer.from(privateKey).toString('hex'),
    };
}

async function checkBalance(provider: ethers.providers.JsonRpcProvider, address: string, amount: number): Promise<boolean> {
    const balance = await provider.getBalance(address);
    return balance.gte(parseEther(amount.toString()));
}

export async function getBalance(address: string): Promise<BigNumberish> {
    const provider = getProviderWithTimeout();
    const balance = await provider.getBalance(address);
    return balance;
}

async function transferSeiToAddress(privateKey: string, amount: number) {
    try {
        const provider = getProvider();
        const wallet = new ethers.Wallet(privateKey, provider);
        const amountInWei = parseEther(amount.toString());
        const gasPrice = await provider.getGasPrice();
        const gasLimit = await provider.estimateGas({
            to: CONTRACT_ADDRESS,
            value: amountInWei,
        });

        const tx = {
            to: CONTRACT_ADDRESS,
            value: amountInWei,
            gasLimit,
            gasPrice,
        };

        const transactionResponse = await wallet.sendTransaction(tx);
        return await transactionResponse.wait();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error during SEI token transfer to address: ${errorMessage}`);
    }
}

export async function transferSeiReward(privateKey: string, address: string, amount: number) {
    try {
        const provider = getProvider();
        const wallet = new ethers.Wallet(privateKey, provider);
        const amountInWei = parseEther(amount.toString());
        let gasPrice = await provider.getGasPrice();
        if (amount > 15) {
            // increase 20% gas price
            gasPrice = gasPrice.mul(ethers.BigNumber.from(12)).div(ethers.BigNumber.from(10));
        }

        // Estimate gas limit and increase by 30%
        let gasLimit;
        try {
            const estimatedGas = await provider.estimateGas({
                to: address,
                value: amountInWei,
            });
            gasLimit = estimatedGas;
            if (amount > 15) {
                // increase 30% gas limit
                gasLimit = estimatedGas.mul(ethers.BigNumber.from(13)).div(ethers.BigNumber.from(10));
            }
        } catch (error) {
            logger.warn('Gas estimation failed, using default limit of 300,000:', error);
            gasLimit = ethers.utils.hexlify(300000); // Use a safe default if estimation fails
        }

        const tx = {
            to: address,
            value: amountInWei,
            gasLimit,
            gasPrice,
        };

        const transactionResponse = await wallet.sendTransaction(tx);
        return await transactionResponse.wait();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error during SEI token transfer to address: ${errorMessage}`);
    }
}

export async function checkin(privateKey: string, amount: number) {
    try {
        const wallet = getWallet(privateKey);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
        const provider = wallet.provider as ethers.providers.JsonRpcProvider;
        const amountInWei = parseEther(amount.toString());

        if (!(await checkBalance(provider, wallet.address, amount))) {
            return { code: 'insufficient funds' };
        }

        const gasLimit = await contract.estimateGas.checkin({ value: amountInWei });
        const gasPrice = await provider.getGasPrice();

        const transactionResponse = await contract.checkin({
            value: amountInWei,
            gasLimit,
            gasPrice,
        });

        return await transactionResponse.wait();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error during checkin: ${errorMessage}`);
    }
}

export async function purchase(privateKey: string, amount: number) {
    try {
        const wallet = getWallet(privateKey);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
        const provider = wallet.provider as ethers.providers.JsonRpcProvider;
        const amountInWei = parseEther(amount.toString());

        if (!(await checkBalance(provider, wallet.address, amount))) {
            return { code: 'insufficient funds' };
        }

        const gasLimit = await contract.estimateGas.purchase({ value: amountInWei });
        const gasPrice = await provider.getGasPrice();

        const transactionResponse = await contract.purchase({
            value: amountInWei,
            gasLimit,
            gasPrice,
        });

        return await transactionResponse.wait();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error during purchase: ${errorMessage}`);
    }
}

async function transferSei(mnemonic: string, recipientAddress: string, amount: number, memo?: string) {
    try {
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'sei' });
        const [firstAccount] = await wallet.getAccounts();
        const client = await SigningStargateClient.connectWithSigner('https://sei-rpc.publicnode.com:443', wallet);

        const gasPrice = GasPrice.fromString('0.1usei');
        const fee = calculateFee(100000, gasPrice);
        const amountFinal = coins(new Decimal(amount).times(1_000_000).toString(), 'usei');

        const result = await client.sendTokens(firstAccount.address, recipientAddress, amountFinal, fee, memo);
        assertIsDeliverTxSuccess(result);

        client.disconnect();
        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error during SEI transfer: ${errorMessage}`);
    }
}

export type CallbackData = {
    type: 'cosmwasm' | 'evm';
    amount: string;
    sender: string;
    recipient: string;
    tx_hash: string;
    events: Record<string, string[]>;
};
