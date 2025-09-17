// package: toothpaste
// file: toothpacket.proto

import * as jspb from "google-protobuf";

export class DataPacket extends jspb.Message {
  getPacketid(): DataPacket.PacketIDMap[keyof DataPacket.PacketIDMap];
  setPacketid(value: DataPacket.PacketIDMap[keyof DataPacket.PacketIDMap]): void;

  getPacketnumber(): number;
  setPacketnumber(value: number): void;

  getTotalpackets(): number;
  setTotalpackets(value: number): void;

  getSlowmode(): boolean;
  setSlowmode(value: boolean): void;

  getIv(): Uint8Array | string;
  getIv_asU8(): Uint8Array;
  getIv_asB64(): string;
  setIv(value: Uint8Array | string): void;

  getDatalen(): number;
  setDatalen(value: number): void;

  getEncrypteddata(): Uint8Array | string;
  getEncrypteddata_asU8(): Uint8Array;
  getEncrypteddata_asB64(): string;
  setEncrypteddata(value: Uint8Array | string): void;

  getTag(): Uint8Array | string;
  getTag_asU8(): Uint8Array;
  getTag_asB64(): string;
  setTag(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DataPacket.AsObject;
  static toObject(includeInstance: boolean, msg: DataPacket): DataPacket.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: DataPacket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DataPacket;
  static deserializeBinaryFromReader(message: DataPacket, reader: jspb.BinaryReader): DataPacket;
}

export namespace DataPacket {
  export type AsObject = {
    packetid: DataPacket.PacketIDMap[keyof DataPacket.PacketIDMap],
    packetnumber: number,
    totalpackets: number,
    slowmode: boolean,
    iv: Uint8Array | string,
    datalen: number,
    encrypteddata: Uint8Array | string,
    tag: Uint8Array | string,
  }

  export interface PacketIDMap {
    DATA_PACKET: 0;
    AUTH_PACKET: 1;
  }

  export const PacketID: PacketIDMap;
}

export class EncryptedData extends jspb.Message {
  hasKeyboardpacket(): boolean;
  clearKeyboardpacket(): void;
  getKeyboardpacket(): KeyboardPacket | undefined;
  setKeyboardpacket(value?: KeyboardPacket): void;

  hasKeycodepacket(): boolean;
  clearKeycodepacket(): void;
  getKeycodepacket(): KeycodePacket | undefined;
  setKeycodepacket(value?: KeycodePacket): void;

  hasMousepacket(): boolean;
  clearMousepacket(): void;
  getMousepacket(): MousePacket | undefined;
  setMousepacket(value?: MousePacket): void;

  hasRenamepacket(): boolean;
  clearRenamepacket(): void;
  getRenamepacket(): RenamePacket | undefined;
  setRenamepacket(value?: RenamePacket): void;

  getPacketdataCase(): EncryptedData.PacketdataCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EncryptedData.AsObject;
  static toObject(includeInstance: boolean, msg: EncryptedData): EncryptedData.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: EncryptedData, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EncryptedData;
  static deserializeBinaryFromReader(message: EncryptedData, reader: jspb.BinaryReader): EncryptedData;
}

export namespace EncryptedData {
  export type AsObject = {
    keyboardpacket?: KeyboardPacket.AsObject,
    keycodepacket?: KeycodePacket.AsObject,
    mousepacket?: MousePacket.AsObject,
    renamepacket?: RenamePacket.AsObject,
  }

  export interface packetTypeMap {
    KEYBOARD_STRING: 0;
    KEYBOARD_KEYCODE: 1;
    MOUSE: 2;
    RENAME: 3;
    CONSUMER_CONTROL: 4;
    COMPOSITE: 5;
  }

  export const packetType: packetTypeMap;

  export enum PacketdataCase {
    PACKETDATA_NOT_SET = 0,
    KEYBOARDPACKET = 1,
    KEYCODEPACKET = 2,
    MOUSEPACKET = 3,
    RENAMEPACKET = 4,
  }
}

export class KeyboardPacket extends jspb.Message {
  getMessage(): string;
  setMessage(value: string): void;

  getLength(): number;
  setLength(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): KeyboardPacket.AsObject;
  static toObject(includeInstance: boolean, msg: KeyboardPacket): KeyboardPacket.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: KeyboardPacket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): KeyboardPacket;
  static deserializeBinaryFromReader(message: KeyboardPacket, reader: jspb.BinaryReader): KeyboardPacket;
}

export namespace KeyboardPacket {
  export type AsObject = {
    message: string,
    length: number,
  }
}

export class RenamePacket extends jspb.Message {
  getMessage(): string;
  setMessage(value: string): void;

  getLength(): number;
  setLength(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RenamePacket.AsObject;
  static toObject(includeInstance: boolean, msg: RenamePacket): RenamePacket.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RenamePacket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RenamePacket;
  static deserializeBinaryFromReader(message: RenamePacket, reader: jspb.BinaryReader): RenamePacket;
}

export namespace RenamePacket {
  export type AsObject = {
    message: string,
    length: number,
  }
}

export class KeycodePacket extends jspb.Message {
  getCode(): Uint8Array | string;
  getCode_asU8(): Uint8Array;
  getCode_asB64(): string;
  setCode(value: Uint8Array | string): void;

  getLength(): number;
  setLength(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): KeycodePacket.AsObject;
  static toObject(includeInstance: boolean, msg: KeycodePacket): KeycodePacket.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: KeycodePacket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): KeycodePacket;
  static deserializeBinaryFromReader(message: KeycodePacket, reader: jspb.BinaryReader): KeycodePacket;
}

export namespace KeycodePacket {
  export type AsObject = {
    code: Uint8Array | string,
    length: number,
  }
}

export class Frame extends jspb.Message {
  getX(): number;
  setX(value: number): void;

  getY(): number;
  setY(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Frame.AsObject;
  static toObject(includeInstance: boolean, msg: Frame): Frame.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Frame, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Frame;
  static deserializeBinaryFromReader(message: Frame, reader: jspb.BinaryReader): Frame;
}

export namespace Frame {
  export type AsObject = {
    x: number,
    y: number,
  }
}

export class MousePacket extends jspb.Message {
  getNumFrames(): number;
  setNumFrames(value: number): void;

  clearFramesList(): void;
  getFramesList(): Array<Frame>;
  setFramesList(value: Array<Frame>): void;
  addFrames(value?: Frame, index?: number): Frame;

  getLClick(): number;
  setLClick(value: number): void;

  getRClick(): number;
  setRClick(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): MousePacket.AsObject;
  static toObject(includeInstance: boolean, msg: MousePacket): MousePacket.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: MousePacket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): MousePacket;
  static deserializeBinaryFromReader(message: MousePacket, reader: jspb.BinaryReader): MousePacket;
}

export namespace MousePacket {
  export type AsObject = {
    numFrames: number,
    framesList: Array<Frame.AsObject>,
    lClick: number,
    rClick: number,
  }
}

export class NotificationPacket extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): NotificationPacket.AsObject;
  static toObject(includeInstance: boolean, msg: NotificationPacket): NotificationPacket.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: NotificationPacket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): NotificationPacket;
  static deserializeBinaryFromReader(message: NotificationPacket, reader: jspb.BinaryReader): NotificationPacket;
}

export namespace NotificationPacket {
  export type AsObject = {
  }

  export interface NotificationTypeMap {
    KEEPALIVE: 0;
    RECV_READY: 1;
    RECV_NOT_READY: 2;
  }

  export const NotificationType: NotificationTypeMap;

  export interface AuthStatusMap {
    AUTH_FAILED: 0;
    AUTH_SUCCESS: 1;
  }

  export const AuthStatus: AuthStatusMap;
}

