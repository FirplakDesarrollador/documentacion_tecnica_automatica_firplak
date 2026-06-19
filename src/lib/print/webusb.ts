const WEBUSB_PRINTER_VENDOR_ID = 0x2D84
const WEBUSB_PRINTER_PRODUCT_ID = 0x4CFB
const WEBUSB_CHUNK_SIZE = 16 * 1024

type WebUsbEndpoint = {
  direction: 'in' | 'out'
  endpointNumber: number
}

type WebUsbAlternateInterface = {
  alternateSetting?: number
  endpoints: WebUsbEndpoint[]
}

type WebUsbInterface = {
  interfaceNumber: number
  alternates: WebUsbAlternateInterface[]
}

type WebUsbConfiguration = {
  configurationValue: number
  interfaces: WebUsbInterface[]
}

type WebUsbOutTransferResult = {
  status?: 'ok' | 'stall'
  bytesWritten?: number
}

type WebUsbDevice = {
  vendorId: number
  productId: number
  productName?: string
  manufacturerName?: string
  opened: boolean
  configuration: WebUsbConfiguration | null
  configurations: WebUsbConfiguration[]
  open: () => Promise<void>
  close: () => Promise<void>
  selectConfiguration: (configurationValue: number) => Promise<void>
  claimInterface: (interfaceNumber: number) => Promise<void>
  releaseInterface?: (interfaceNumber: number) => Promise<void>
  selectAlternateInterface?: (interfaceNumber: number, alternateSetting: number) => Promise<void>
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<WebUsbOutTransferResult>
}

type WebUsbNavigator = {
  getDevices: () => Promise<WebUsbDevice[]>
  requestDevice: (options: { filters: Array<{ vendorId: number; productId: number }> }) => Promise<WebUsbDevice>
}

export type WebUsbPrinterConnection = {
  device: WebUsbDevice
  deviceName: string
  endpointNumber: number
  interfaceNumber: number
}

function getUsbNavigator(): WebUsbNavigator | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { usb?: WebUsbNavigator }).usb ?? null
}

function getDeviceName(device: WebUsbDevice) {
  return device.productName || device.manufacturerName || '4BARCODE 4B-2054TG'
}

function isTargetPrinter(device: WebUsbDevice) {
  return device.vendorId === WEBUSB_PRINTER_VENDOR_ID && device.productId === WEBUSB_PRINTER_PRODUCT_ID
}

export function isWebUsbSupported() {
  return getUsbNavigator() !== null
}

export function getWebUsbErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No se selecciono la impresora USB.'
  }
  if (error instanceof DOMException && error.name === 'SecurityError') {
    return 'Chrome bloqueo WebUSB. Abre SamiGen en HTTPS con Chrome o Edge.'
  }
  if (error instanceof DOMException && error.name === 'NetworkError') {
    return 'No se pudo abrir la impresora USB. Puede estar ocupada por Windows o por otro proceso.'
  }

  return (error as Error)?.message || 'No se pudo usar WebUSB con esta impresora.'
}

async function connectWebUsbDevice(device: WebUsbDevice): Promise<WebUsbPrinterConnection> {
  if (!device.opened) {
    await device.open()
  }

  if (!device.configuration) {
    const configurationValue = device.configurations[0]?.configurationValue ?? 1
    await device.selectConfiguration(configurationValue)
  }

  const configuration = device.configuration
  if (!configuration) {
    throw new Error('La impresora USB no expuso una configuracion utilizable.')
  }

  let lastError: unknown = null
  for (const usbInterface of configuration.interfaces) {
    for (const alternate of usbInterface.alternates) {
      const endpoint = alternate.endpoints.find((candidate) => candidate.direction === 'out')
      if (!endpoint) continue

      let claimed = false
      try {
        await device.claimInterface(usbInterface.interfaceNumber)
        claimed = true

        if (typeof alternate.alternateSetting === 'number' && device.selectAlternateInterface) {
          await device.selectAlternateInterface(usbInterface.interfaceNumber, alternate.alternateSetting)
        }

        return {
          device,
          deviceName: getDeviceName(device),
          endpointNumber: endpoint.endpointNumber,
          interfaceNumber: usbInterface.interfaceNumber,
        }
      } catch (error) {
        lastError = error
        if (claimed && device.releaseInterface) {
          try { await device.releaseInterface(usbInterface.interfaceNumber) } catch {}
        }
      }
    }
  }

  throw new Error(getWebUsbErrorMessage(lastError) || 'No se encontro un endpoint USB de salida para imprimir.')
}

export async function requestWebUsbPrinter() {
  const usb = getUsbNavigator()
  if (!usb) {
    throw new Error('WebUSB no esta disponible. Usa Chrome o Edge actualizado.')
  }

  const device = await usb.requestDevice({
    filters: [{ vendorId: WEBUSB_PRINTER_VENDOR_ID, productId: WEBUSB_PRINTER_PRODUCT_ID }],
  })

  return connectWebUsbDevice(device)
}

export async function reconnectAuthorizedWebUsbPrinter() {
  const usb = getUsbNavigator()
  if (!usb) return null

  const devices = await usb.getDevices()
  const device = devices.find(isTargetPrinter)
  return device ? connectWebUsbDevice(device) : null
}

export async function sendWebUsbPrintJob(connection: WebUsbPrinterConnection, bytes: Uint8Array) {
  for (let offset = 0; offset < bytes.length; offset += WEBUSB_CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + WEBUSB_CHUNK_SIZE)
    const result = await connection.device.transferOut(connection.endpointNumber, chunk)
    if (result.status && result.status !== 'ok') {
      throw new Error(`La impresora USB rechazo el envio (${result.status}).`)
    }
  }
}
