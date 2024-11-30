export const getSize = (offset, data) => {
  const byte = data[offset];
  const firstTwoBits = byte >> 6;
  let length = 0;
  switch (firstTwoBits) {
    case 0b01:
      length = ((byte & 0b00111111) << 8) | data[offset + 1];
      offset += 2;
      break;
    case 0b10:
      length = data.readUInt32BE(offset + 1);
      offset += 5;
      break;
    case 0b11: // Special encoding
      // Handle special encoding
      switch (data[offset]) {
        case 0xc0:
          length = 1;
          break;
        case 0xc1:
          length = 2;
          break;
        case 0xc2:
          length = 4;
          break;
      }
      offset++;
      break;
    default:
      length = byte & 0b00111111;
      offset++;
      break;
  }
  return { offset, length };
};

export const getNextBytes = (offset, data) => {
  const size = getSize(offset, data);
  const length = size.length;
  offset = size.offset;
  let nextBytes;
  if (length === 0) {
    nextBytes = Buffer.alloc(1);
    nextBytes[0] = data[offset];
    offset++;
  } else {
    nextBytes = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      nextBytes[i] = data[offset];
      offset++;
    }
  }
  return { offset, nextBytes };
};
