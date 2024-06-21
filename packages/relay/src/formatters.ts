/*-
 *
 * Hedera JSON RPC Relay
 *
 * Copyright (C) 2022-2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import constants from './lib/constants';
import crypto from 'crypto';
import { Transaction, Transaction1559, Transaction2930 } from './lib/model';
import { BigNumber } from '@hashgraph/sdk/lib/Transfer';
import { BigNumber as BN } from 'bignumber.js';

const EMPTY_HEX = '0x';

const hashNumber = (num) => {
  return EMPTY_HEX + num.toString(16);
};

const generateRandomHex = (bytesLength = 16) => {
  return '0x' + crypto.randomBytes(bytesLength).toString('hex');
};

/**
 * Format message prefix for logger.
 */
const formatRequestIdMessage = (requestId?: string): string => {
  return requestId ? `[${constants.REQUEST_ID_STRING}${requestId}]` : '';
};

function hexToASCII(str: string): string {
  const hex = str.toString();
  let ascii = '';
  for (let n = 0; n < hex.length; n += 2) {
    ascii += String.fromCharCode(parseInt(hex.substring(n, n + 2), 16));
  }
  return ascii;
}

function ASCIIToHex(ascii: string): string {
  const hex: string[] = [];
  for (let n = 0; n < ascii.length; n++) {
    hex.push(Number(ascii.charCodeAt(n)).toString(16));
  }
  return hex.join('');
}

/**
 * Converts an EVM ErrorMessage to a readable form. For example this :
 * 0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d53657420746f2072657665727400000000000000000000000000000000000000
 * will be converted to "Set to revert"
 * @param message
 */
const decodeErrorMessage = (message?: string): string => {
  if (!message) return '';

  // If the message does not start with 0x, it is not an error message, return it as is
  if (!message.includes(EMPTY_HEX)) return message;

  message = message.replace(/^0x/, ''); // Remove the starting 0x
  const strLen = parseInt(message.slice(8 + 64, 8 + 128), 16); // Get the length of the readable text
  const resultCodeHex = message.slice(8 + 128, 8 + 128 + strLen * 2); // Extract the hex of the text
  return hexToASCII(resultCodeHex);
};

const formatTransactionId = (transactionId: string): string | null => {
  if (!constants.TRANSACTION_ID_REGEX.test(transactionId)) {
    return null;
  }

  const transactionSplit = transactionId.split('@');
  const payer = transactionSplit[0];
  const timestamp = transactionSplit[1].replace('.', '-');
  return `${payer}-${timestamp}`;
};

/**
 * Retrieve formated transactionID without query params
 * @param transactionId The string value of the transactionId
 * @returns string | null
 */
const formatTransactionIdWithoutQueryParams = (transactionId: string): string | null => {
  // get formatted transactionID
  const formattedTransactionIdWithQueryParams = formatTransactionId(transactionId);

  // handle formattedTransactionIdWithQueryParams is empty
  if (!formattedTransactionIdWithQueryParams) {
    return null;
  }

  // split the formattedTransactionIdWithQueryParams with `?` and return the formatedID without params
  return formattedTransactionIdWithQueryParams.split('?')[0];
};

/**
 * Reads a value loaded up from the `.env` file, and converts it to a number.
 * If it is not set in `.env` or set as an empty string or other non-numeric
 * value, it uses the default value specified in constants.
 * @param envVarName The name of the env var to read in from the `.env` file
 * @param constantName The name of the constant to use as a fallback when the
 *   specified env var is invalid
 * @throws An error if both the env var and constant are invalid
 */
const parseNumericEnvVar = (envVarName: string, fallbackConstantKey: string): number => {
  let value: number = Number.parseInt(process.env[envVarName] ?? '', 10);
  if (!isNaN(value)) {
    return value;
  }
  value = Number.parseInt((constants[fallbackConstantKey] ?? '').toString());
  if (isNaN(value)) {
    throw new Error(`Unable to parse numeric env var: '${envVarName}', constant: '${fallbackConstantKey}'`);
  }
  return value;
};

/**
 * Parse weibar hex string to tinybar number, by applying tinybar to weibar coef.
 * Return null, if value is not a valid hex. Null is the only other valid response that mirror-node accepts.
 * @param value
 * @returns tinybarValue
 */
const weibarHexToTinyBarInt = (value: string): number | null => {
  if (value && value !== '0x') {
    const weiBigInt = BigInt(value);
    const coefBigInt = BigInt(constants.TINYBAR_TO_WEIBAR_COEF);
    // Calculate the tinybar value
    const tinybarValue = weiBigInt / coefBigInt;
    // Check if there was a fractional part that got discarded
    if (tinybarValue === BigInt(0) && weiBigInt > BigInt(0)) {
      return 1; // Round up to the smallest unit of tinybar
    }
    return Number(tinybarValue);
  }
  return null;
};

const formatContractResult = (cr: any) => {
  if (cr === null) {
    return null;
  }

  const gasPrice =
    cr.gas_price === null || cr.gas_price === '0x'
      ? '0x0'
      : isHex(cr.gas_price)
      ? cr.gas_price
      : nanOrNumberTo0x(cr.gas_price);

  const commonFields = {
    blockHash: toHash32(cr.block_hash),
    blockNumber: nullableNumberTo0x(cr.block_number),
    from: cr.from.substring(0, 42),
    gas: nanOrNumberTo0x(cr.gas_used),
    gasPrice,
    hash: cr.hash.substring(0, 66),
    input: cr.function_parameters,
    nonce: nanOrNumberTo0x(cr.nonce),
    r: cr.r === null ? '0x0' : cr.r.substring(0, 66),
    s: cr.s === null ? '0x0' : cr.s.substring(0, 66),
    to: cr.to?.substring(0, 42),
    transactionIndex: nullableNumberTo0x(cr.transaction_index),
    type: cr.type === null ? '0x0' : nanOrNumberTo0x(cr.type),
    v: cr.v === null ? '0x0' : nanOrNumberTo0x(cr.v),
    value: nanOrNumberTo0x(cr.amount),
    // for legacy EIP155 with tx.chainId=0x0, mirror-node will return a '0x' (EMPTY_HEX) value for contract result's chain_id
    //   which is incompatibile with certain tools (i.e. foundry). By setting this field, chainId, to undefined, the end jsonrpc
    //   object will leave out this field, which is the proper behavior for other tools to be compatible with.
    chainId: cr.chain_id === EMPTY_HEX ? undefined : cr.chain_id,
  };

  switch (cr.type) {
    case 0:
      return new Transaction(commonFields); // eip 155 fields
    case 1:
      return new Transaction2930({
        ...commonFields,
        accessList: [],
      }); // eip 2930 fields
    case 2:
      return new Transaction1559({
        ...commonFields,
        accessList: [],
        maxPriorityFeePerGas:
          cr.max_priority_fee_per_gas === null || cr.max_priority_fee_per_gas === '0x'
            ? '0x0'
            : prepend0x(trimPrecedingZeros(cr.max_priority_fee_per_gas)),
        maxFeePerGas:
          cr.max_fee_per_gas === null || cr.max_fee_per_gas === '0x'
            ? '0x0'
            : prepend0x(trimPrecedingZeros(cr.max_fee_per_gas)),
      }); // eip 1559 fields
    case null:
      return new Transaction(commonFields); //hapi
  }
  return null;
};

const strip0x = (input: string): string => {
  return input.startsWith(EMPTY_HEX) ? input.substring(2) : input;
};

const prepend0x = (input: string): string => {
  return input.startsWith(EMPTY_HEX) ? input : EMPTY_HEX + input;
};

const trimPrecedingZeros = (input: string) => {
  return parseInt(input, 16).toString(16);
};

const numberTo0x = (input: number | BigNumber | bigint): string => {
  return EMPTY_HEX + input.toString(16);
};

const nullableNumberTo0x = (input: number | BigNumber): string | null => {
  return input == null ? null : numberTo0x(input);
};

const nanOrNumberTo0x = (input: number | BigNumber): string => {
  return input == null || Number.isNaN(input) ? numberTo0x(0) : numberTo0x(input);
};

const toHash32 = (value: string): string => {
  return value.substring(0, 66);
};

const toNullableBigNumber = (value: string): string | null => {
  if (typeof value === 'string') {
    return new BN(value).toString();
  }

  return null;
};

const toNullIfEmptyHex = (value: string): string | null => {
  return value === EMPTY_HEX ? null : value;
};

const stringToHex = (str) => {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    const hexValue = charCode.toString(16);

    // Pad with zeros to ensure two-digit representation
    hex += hexValue.padStart(2, '0');
  }
  return hex;
};

const toHexString = (byteArray) => {
  if (typeof byteArray !== 'object') {
    byteArray = Buffer.from(byteArray?.toString() ?? '', 'hex');
  }

  const encoded = Buffer.from(byteArray, 'utf8').toString('hex');
  return encoded;
};

const isValidEthereumAddress = (address: string): boolean => {
  return new RegExp(constants.BASE_HEX_REGEX + '{40}$').test(address);
};

const isHex = (value: string): boolean => {
  const hexRegex = /^0x[0-9a-fA-F]+$/;
  return hexRegex.test(value);
};

export {
  hashNumber,
  formatRequestIdMessage,
  hexToASCII,
  decodeErrorMessage,
  formatTransactionId,
  formatTransactionIdWithoutQueryParams,
  parseNumericEnvVar,
  formatContractResult,
  prepend0x,
  numberTo0x,
  nullableNumberTo0x,
  nanOrNumberTo0x,
  toHash32,
  toNullableBigNumber,
  toNullIfEmptyHex,
  generateRandomHex,
  trimPrecedingZeros,
  weibarHexToTinyBarInt,
  stringToHex,
  strip0x,
  toHexString,
  isValidEthereumAddress,
  isHex,
  ASCIIToHex,
};
