/* src/features/device/bleClient.ts */

import { Buffer } from "buffer";
import { BleManager, Device, State, type Subscription } from "react-native-ble-plx";

import { requestBlePermissions } from "./blePermissions";

// -----------------------------------------------------------------------------
// PocketLab BLE UUIDs
// -----------------------------------------------------------------------------

// export const POCKETLAB_SERVICE_UUID = "8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001";

// export const COMMAND_RX_UUID = "8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001";

export const POCKETLAB_SERVICE_UUID = "8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001";

export const COMMAND_RX_UUID = "8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001";

export const RESPONSE_TX_UUID = "8f5b0003-6c4d-4a73-a8f1-3d9ea01c0001";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type DiscoveredCharacteristic = {
  serviceUUID: string;
  characteristicUUID: string;
  isReadable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  isIndicatable: boolean;
};

type DisconnectHandler = (error: Error | null) => void;
type ReconnectingHandler = () => void;
type ReconnectedHandler = (device: Device) => void;

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeBleError(error: unknown): Error | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message);
  }

  return new Error("Unknown BLE error");
}

// -----------------------------------------------------------------------------
// BLE client
// -----------------------------------------------------------------------------

class BleDiagnostic {
  private readonly manager: BleManager;

  private connectedDevice: Device | null = null;

  private requestInProgress = false;

  /**
   * Incremented whenever a new connection becomes active or the current
   * connection is intentionally invalidated.
   *
   * A disconnect callback captures the generation associated with its
   * connection. If a later connection has already replaced it, the callback
   * is ignored rather than clearing the new connectedDevice.
   */
  private connectionGeneration = 0;

  private intentionalDisconnect = false;
  private reconnecting = false;

  private responseSubscription: Subscription | null = null;

  private readonly responseListeners = new Set<(response: string) => void>();

  constructor() {
    this.manager = new BleManager();
  }

  // ---------------------------------------------------------------------------
  // Bluetooth state and scanning
  // ---------------------------------------------------------------------------

  public async waitForBluetooth(): Promise<void> {
    const currentState = await this.manager.state();

    if (currentState === State.PoweredOn) {
      console.log("[BLE] Bluetooth is powered on");
      return;
    }

    console.log(`[BLE] Waiting for Bluetooth. Current state: ${currentState}`);

    await new Promise<void>((resolve, reject) => {
      const subscription = this.manager.onStateChange((state) => {
        console.log(`[BLE] State changed: ${state}`);

        if (state === State.PoweredOn) {
          subscription.remove();
          resolve();
          return;
        }

        if (state === State.Unauthorized) {
          subscription.remove();
          reject(new Error("Bluetooth permission was denied"));
          return;
        }

        if (state === State.Unsupported) {
          subscription.remove();
          reject(new Error("BLE is not supported on this device"));
        }
      }, true);
    });
  }

  public async scanForPocketLab(onDeviceFound: (device: Device) => void): Promise<void> {
    const permissionGranted = await requestBlePermissions();

    if (!permissionGranted) {
      throw new Error("Bluetooth permissions were denied.");
    }

    await this.waitForBluetooth();

    this.stopScan();

    console.log("[BLE] Starting scan");

    this.manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("[BLE] Scan error:", error);
        this.stopScan();
        return;
      }

      if (!device) {
        return;
      }

      const displayName = device.name ?? device.localName ?? "Unnamed BLE device";

      console.log(`[BLE] Found: ${displayName}, ID: ${device.id}, RSSI: ${device.rssi}`);

      /*
       * Show every device during development.
       *
       * Later, this can be filtered by the advertised PocketLab
       * service UUID or by the "PocketLab" device name.
       */
      onDeviceFound(device);
    });
  }

  public stopScan(): void {
    console.log("[BLE] Stopping scan");
    this.manager.stopDeviceScan();
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  public async connect(
    device: Device,
    onDisconnected?: DisconnectHandler,
    onReconnecting?: ReconnectingHandler,
    onReconnected?: ReconnectedHandler
  ): Promise<Device> {
    this.stopScan();

    this.intentionalDisconnect = false;
    this.reconnecting = false;

    const connectedDevice = await this.connectOnce(device);

    const generation = this.connectionGeneration;

    this.attachDisconnectListener(
      connectedDevice,
      generation,
      device,
      onDisconnected,
      onReconnecting,
      onReconnected
    );

    return connectedDevice;
  }

  private async connectOnce(device: Device): Promise<Device> {
    console.log(`[BLE] Connecting to ${device.name ?? device.id}`);

    let connectedDevice = await device.connect({
      timeout: 10000,
    });

    console.log("[BLE] Connected");

    /*
     * Request a larger MTU before service discovery and notification setup.
     * Android may negotiate a value lower than 247.
     */
    try {
      connectedDevice = await connectedDevice.requestMTU(247);

      console.log(`[BLE] MTU negotiated: ${connectedDevice.mtu}`);
    } catch (error) {
      /*
       * A larger MTU is useful but not required for basic commands.
       * Continue using the default MTU if negotiation fails.
       */
      console.warn("[BLE] MTU request failed; continuing with default MTU:", error);
    }

    connectedDevice = await connectedDevice.discoverAllServicesAndCharacteristics();

    console.log("[BLE] Service discovery complete");

    /*
     * This connection is now the authoritative session.
     * Incrementing the generation invalidates listeners from older sessions.
     */
    this.connectionGeneration += 1;
    this.connectedDevice = connectedDevice;

    this.startResponseMonitor();

    return connectedDevice;
  }

  private attachDisconnectListener(
    connectedDevice: Device,
    generation: number,
    originalDevice: Device,
    onDisconnected?: DisconnectHandler,
    onReconnecting?: ReconnectingHandler,
    onReconnected?: ReconnectedHandler
  ): void {
    connectedDevice.onDisconnected((error) => {
      /*
       * A delayed disconnect callback from an older connection must not clear
       * a newer connection that has already replaced it.
       */
      if (generation !== this.connectionGeneration) {
        console.log("[BLE] Ignoring stale disconnect callback");
        return;
      }

      if (error) {
        console.error("[BLE] Device disconnected with error:", error);
      } else {
        console.log("[BLE] Device disconnected");
      }

      this.stopResponseMonitor();
      this.connectedDevice = null;

      /*
       * Invalidate this generation so a duplicate callback for the same
       * session cannot affect later state.
       */
      this.connectionGeneration += 1;

      const normalizedError = normalizeBleError(error);

      onDisconnected?.(normalizedError);

      if (this.intentionalDisconnect) {
        console.log("[BLE] Manual disconnect; skipping reconnect");
        return;
      }

      void this.reconnect(originalDevice, onReconnecting, onReconnected, onDisconnected);
    });
  }

  private async reconnect(
    device: Device,
    onReconnecting?: ReconnectingHandler,
    onReconnected?: ReconnectedHandler,
    onDisconnected?: DisconnectHandler
  ): Promise<void> {
    if (this.reconnecting || this.intentionalDisconnect) {
      return;
    }

    this.reconnecting = true;
    onReconnecting?.();

    let attempt = 0;

    while (!this.intentionalDisconnect) {
      attempt += 1;

      const waitMilliseconds = Math.min(attempt * 1000, 5000);

      console.log(`[BLE] Reconnect attempt ${attempt} in ${waitMilliseconds} ms`);

      await delay(waitMilliseconds);

      if (this.intentionalDisconnect) {
        break;
      }

      try {
        const reconnectedDevice = await this.connectOnce(device);

        /*
         * The user may have pressed Disconnect while connectOnce was
         * awaiting the native connection.
         */
        if (this.intentionalDisconnect) {
          console.log(
            "[BLE] Reconnect completed after manual disconnect; cancelling connection"
          );

          this.connectionGeneration += 1;
          this.connectedDevice = null;
          this.stopResponseMonitor();

          await this.manager.cancelDeviceConnection(reconnectedDevice.id);

          break;
        }

        const generation = this.connectionGeneration;

        this.attachDisconnectListener(
          reconnectedDevice,
          generation,
          device,
          onDisconnected,
          onReconnecting,
          onReconnected
        );

        console.log("[BLE] Reconnected successfully");

        this.reconnecting = false;
        onReconnected?.(reconnectedDevice);

        return;
      } catch (error) {
        if (this.intentionalDisconnect) {
          break;
        }

        console.warn(`[BLE] Reconnect attempt ${attempt} failed`, error);
      }
    }

    this.reconnecting = false;
  }

  public async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.reconnecting = false;

    this.stopScan();
    this.stopResponseMonitor();

    const device = this.connectedDevice;

    /*
     * Invalidate the current listener before cancelling the native
     * connection. Its resulting disconnect callback will be ignored.
     */
    this.connectionGeneration += 1;
    this.connectedDevice = null;

    if (!device) {
      console.log("[BLE] No active device to disconnect");
      return;
    }

    console.log(`[BLE] Disconnecting ${device.id}`);

    try {
      await this.manager.cancelDeviceConnection(device.id);
    } catch (error) {
      console.warn("[BLE] Error while disconnecting:", error);
    }
  }

  public hasConnectedDevice(): boolean {
    return this.connectedDevice !== null;
  }

  public isReconnecting(): boolean {
    return this.reconnecting;
  }

  // ---------------------------------------------------------------------------
  // Service discovery
  // ---------------------------------------------------------------------------

  public async discoverCharacteristics(
    device: Device = this.requireConnectedDevice()
  ): Promise<DiscoveredCharacteristic[]> {
    const results: DiscoveredCharacteristic[] = [];
    const services = await device.services();

    console.log(`[BLE] Found ${services.length} services`);

    for (const service of services) {
      console.log(`[BLE] Service: ${service.uuid}`);

      const characteristics = await service.characteristics();

      for (const characteristic of characteristics) {
        const info: DiscoveredCharacteristic = {
          serviceUUID: service.uuid,
          characteristicUUID: characteristic.uuid,
          isReadable: characteristic.isReadable,
          isWritableWithResponse: characteristic.isWritableWithResponse,
          isWritableWithoutResponse: characteristic.isWritableWithoutResponse,
          isNotifiable: characteristic.isNotifiable,
          isIndicatable: characteristic.isIndicatable,
        };

        results.push(info);

        console.log("[BLE] Characteristic:", info);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Response notifications
  // ---------------------------------------------------------------------------

  public startResponseMonitor(): void {
    const device = this.requireConnectedDevice();

    this.stopResponseMonitor();

    console.log("[BLE] Subscribing to PocketLab responses");

    this.responseSubscription = device.monitorCharacteristicForService(
      POCKETLAB_SERVICE_UUID,
      RESPONSE_TX_UUID,
      (error, characteristic) => {
        if (error) {
          /*
           * A cancellation error is expected when the monitor is removed
           * during disconnect or reconnect.
           */
          if (this.intentionalDisconnect || !this.connectedDevice) {
            console.log("[BLE] Response monitor ended");
            return;
          }

          console.error("[BLE] Response notification error:", error);
          return;
        }

        if (!characteristic?.value) {
          console.warn("[BLE] Response notification had no value");
          return;
        }

        const response = Buffer.from(characteristic.value, "base64").toString("utf8");

        console.log(`[BLE] Response received: "${response}"`);

        for (const listener of this.responseListeners) {
          listener(response);
        }
      }
    );
  }

  public stopResponseMonitor(): void {
    if (!this.responseSubscription) {
      return;
    }

    this.responseSubscription.remove();
    this.responseSubscription = null;

    console.log("[BLE] Response monitor stopped");
  }

  // ---------------------------------------------------------------------------
  // Command protocol
  // ---------------------------------------------------------------------------

  public async writeCommand(command: string): Promise<void> {
    const device = this.requireConnectedDevice();

    const normalizedCommand = command.trim();

    if (!normalizedCommand) {
      throw new Error("Cannot send an empty PocketLab command.");
    }

    const encodedValue = Buffer.from(normalizedCommand, "utf8").toString("base64");

    console.log("[BLE] Writing PocketLab command:", {
      command: normalizedCommand,
      serviceUUID: POCKETLAB_SERVICE_UUID,
      characteristicUUID: COMMAND_RX_UUID,
      encodedValue,
    });

    const result = await device.writeCharacteristicWithResponseForService(
      POCKETLAB_SERVICE_UUID,
      COMMAND_RX_UUID,
      encodedValue
    );

    console.log("[BLE] Command write accepted:", {
      serviceUUID: result.serviceUUID,
      characteristicUUID: result.uuid,
      value: result.value,
    });
  }

  /**
   * Diagnostic: write and read through the exact same connected Device object.
   */
  public async directDeviceWriteTest(command = "PING"): Promise<string> {
    const device = this.requireConnectedDevice();
    const normalizedCommand = command.trim();

    if (!normalizedCommand) {
      throw new Error("Cannot send an empty PocketLab command.");
    }

    const connected = await device.isConnected();
    const encodedValue = Buffer.from(normalizedCommand, "utf8").toString("base64");

    console.log("[BLE DIRECT TEST] Starting:", {
      deviceId: device.id,
      deviceName: device.name ?? device.localName ?? null,
      connected,
      connectionGeneration: this.connectionGeneration,
      serviceUUID: POCKETLAB_SERVICE_UUID,
      characteristicUUID: COMMAND_RX_UUID,
      command: normalizedCommand,
      encodedValue,
    });

    if (!connected) {
      throw new Error(
        `Stored BLE device ${device.id} is not connected during the direct write test.`
      );
    }

    const writeResult = await device.writeCharacteristicWithResponseForService(
      POCKETLAB_SERVICE_UUID,
      COMMAND_RX_UUID,
      encodedValue
    );

    console.log("[BLE DIRECT TEST] Write accepted:", {
      deviceId: device.id,
      writeDeviceId: writeResult.deviceID,
      serviceUUID: writeResult.serviceUUID,
      characteristicUUID: writeResult.uuid,
      value: writeResult.value,
      isWritableWithResponse: writeResult.isWritableWithResponse,
      isWritableWithoutResponse: writeResult.isWritableWithoutResponse,
    });

    await delay(500);

    const readResult = await device.readCharacteristicForService(
      POCKETLAB_SERVICE_UUID,
      COMMAND_RX_UUID
    );

    const decodedValue = readResult.value
      ? Buffer.from(readResult.value, "base64").toString("utf8")
      : "";

    console.log("[BLE DIRECT TEST] Read-back:", {
      deviceId: device.id,
      readDeviceId: readResult.deviceID,
      serviceUUID: readResult.serviceUUID,
      characteristicUUID: readResult.uuid,
      encodedValue: readResult.value,
      decodedValue,
    });

    return decodedValue;
  }

  public async writeCommandWithoutResponse(command: string): Promise<void> {
    const device = this.requireConnectedDevice();

    const normalizedCommand = command.trim();

    if (!normalizedCommand) {
      throw new Error("Cannot send an empty PocketLab command.");
    }

    const encodedValue = Buffer.from(normalizedCommand, "utf8").toString("base64");

    console.log(`[BLE] Writing without response: "${normalizedCommand}"`);

    await device.writeCharacteristicWithoutResponseForService(
      POCKETLAB_SERVICE_UUID,
      COMMAND_RX_UUID,
      encodedValue
    );

    console.log("[BLE] Write without response submitted");
  }

  /**
   * Diagnostic method.
   *
   * COMMAND_RX_UUID must include the READ property in the ESP32 firmware
   * for this method to work.
   */
  public async readCommandValue(): Promise<string> {
    const device = this.requireConnectedDevice();

    const characteristic = await device.readCharacteristicForService(
      POCKETLAB_SERVICE_UUID,
      COMMAND_RX_UUID
    );

    const value = characteristic.value
      ? Buffer.from(characteristic.value, "base64").toString("utf8")
      : "";

    console.log(`[BLE] Command RX read-back value: "${value}"`);

    return value;
  }

  public async request(command: string, timeoutMs = 5000): Promise<string> {
    this.requireConnectedDevice();

    if (this.requestInProgress) {
      throw new Error("Another PocketLab request is already in progress.");
    }

    this.requestInProgress = true;

    try {
      return await new Promise<string>((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeout);
          this.responseListeners.delete(handleResponse);
        };

        const finish = (action: () => void) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          action();
        };

        const handleResponse = (response: string) => {
          finish(() => resolve(response));
        };

        const timeout = setTimeout(() => {
          finish(() => {
            reject(
              new Error(`PocketLab command timed out after ${timeoutMs} ms: ${command}`)
            );
          });
        }, timeoutMs);

        this.responseListeners.add(handleResponse);

        void this.writeCommand(command).catch((error: unknown) => {
          finish(() => {
            reject(
              error instanceof Error
                ? error
                : new Error("PocketLab command write failed.")
            );
          });
        });
      });
    } finally {
      this.requestInProgress = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  public destroy(): void {
    this.intentionalDisconnect = true;
    this.reconnecting = false;

    this.stopScan();
    this.stopResponseMonitor();

    this.responseListeners.clear();
    this.connectionGeneration += 1;
    this.connectedDevice = null;

    this.manager.destroy();

    console.log("[BLE] BLE manager destroyed");
  }

  private requireConnectedDevice(): Device {
    if (!this.connectedDevice) {
      throw new Error("No BLE device is currently connected");
    }

    return this.connectedDevice;
  }
}

export const bleDiagnostic = new BleDiagnostic();
