'use strict';

class EndianBuffer {
  constructor(buffer, isLittleEndian) {
    this.buffer = buffer;
    this.isLittleEndian = isLittleEndian;
  }

  get length() {
    return this.buffer.length;
  }

  readUInt32(offset) {
    if (this.isLittleEndian) {
      return this.buffer.readUInt32LE(offset);
    } else {
      return this.buffer.readUInt32BE(offset);
    }
  }

  writeUInt32(data, offset) {
    if (this.isLittleEndian) {
      return this.buffer.writeUInt32LE(data, offset);
    } else {
      return this.buffer.writeUInt32BE(data, offset);
    }
  }

  readDouble(offset) {
    if (this.isLittleEndian) {
      return this.buffer.readDoubleLE(offset);
    } else {
      return this.buffer.readDoubleBE(offset);
    }
  }

  readFloat(offset) {
    if (this.isLittleEndian) {
      return this.buffer.readFloatLE(offset);
    } else {
      return this.buffer.readFloatBE(offset);
    }
  }

  readString(offset, length) {
    return this.buffer.toString('utf8', offset, offset + length);
  }

  readSlapString(offset) {
    const length = this.readUInt32(offset);
    return this.readString(offset + 4, length);
  }

  writeSlapString(offset, string) {
    this.writeUInt32(string.length, offset);
    return this.buffer.write(string, offset + 4) + 4;
  }

  slice(start, end) {
    return new EndianBuffer(this.buffer.slice(start, end), this.isLittleEndian);
  }
}

module.exports = EndianBuffer;
