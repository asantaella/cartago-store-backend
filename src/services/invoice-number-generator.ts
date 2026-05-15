import { Order, OrderService, TransactionBaseService } from "@medusajs/medusa";
import { EntityManager } from "typeorm";
import InvoiceCounterRepository from "../repositories/invoice-counter";

const SINGLETON_ID = "invoice_global";

type InjectedDependencies = {
  manager: EntityManager;
  invoiceCounterRepository: typeof InvoiceCounterRepository;
  orderService: OrderService;
};

class InvoiceNumberGeneratorService extends TransactionBaseService {
  static identifier = "invoiceNumberGeneratorService";

  protected invoiceCounterRepository_: typeof InvoiceCounterRepository;

  protected orderService_: OrderService;

  constructor({
    invoiceCounterRepository,
    orderService,
  }: InjectedDependencies) {
    super(arguments[0]);
    this.invoiceCounterRepository_ = invoiceCounterRepository;
    this.orderService_ = orderService;
  }

  public formatInvoiceNumber(counter: number): string {
    const year = new Date().getFullYear();
    return `${year}-${counter.toString().padStart(5, "0")}`;
  }

  /**
   * Returns the current counter value without incrementing.
   */
  async getCounter(): Promise<number> {
    const repo = this.activeManager_.withRepository(
      this.invoiceCounterRepository_,
    );
    const record = await repo.findOne({ where: { id: SINGLETON_ID } });
    if (!record) {
      throw new Error(
        "Invoice counter singleton not found. Run migrations first.",
      );
    }
    return record.counter;
  }

  /**
   * Sets the counter to an explicit value (admin override).
   */
  async setCounter(value: number): Promise<number> {
    return await this.atomicPhase_(
      async (transactionManager: EntityManager) => {
        const repo = transactionManager.withRepository(
          this.invoiceCounterRepository_,
        );
        const record = await repo.findOne({ where: { id: SINGLETON_ID } });
        if (!record) {
          throw new Error(
            "Invoice counter singleton not found. Run migrations first.",
          );
        }
        record.counter = value;
        await repo.save(record);
        return record.counter;
      },
    );
  }

  /**
   * Atomically increments the counter and returns the next formatted invoice number.
   * Uses a pessimistic write lock to prevent duplicate numbers under concurrent load.
   */
  async getNextInvoiceNumber(): Promise<string> {
    return await this.atomicPhase_(
      async (transactionManager: EntityManager) => {
        const repo = transactionManager.withRepository(
          this.invoiceCounterRepository_,
        );

        const record = await repo.findOne({
          where: { id: SINGLETON_ID },
          lock: { mode: "pessimistic_write" },
        });

        if (!record) {
          throw new Error(
            "Invoice counter singleton not found. Run migrations first.",
          );
        }

        record.counter += 1;
        await repo.save(record);

        return this.formatInvoiceNumber(record.counter);
      },
    );
  }

  /**
   * Assigns the next invoice number to an order's metadata.
   * Skips assignment if the order already has invoice_number set.
   * Returns the invoice number (existing or newly assigned).
   */
  async setOrderInvoiceNumber(orderId: string): Promise<string> {
    const order = await this.orderService_.retrieve(orderId, {
      select: ["id", "metadata"],
    });

    if (order.metadata?.invoice_number) {
      return order.metadata.invoice_number as string;
    }

    const invoiceNumber = await this.getNextInvoiceNumber();

    await this.orderService_.update(orderId, {
      metadata: {
        ...order.metadata,
        invoice_number: invoiceNumber,
      },
    });

    return invoiceNumber;
  }
}

export default InvoiceNumberGeneratorService;
