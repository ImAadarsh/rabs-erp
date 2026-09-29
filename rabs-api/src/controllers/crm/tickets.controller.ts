import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Ticket } from '@entities/crm/Ticket.js';
import { TicketMessage } from '@entities/crm/TicketMessage.js';
import { TicketAssignment } from '@entities/crm/TicketAssignment.js';
import { Organization } from '@entities/iam/Organization.js';
import { Customer } from '@entities/orders/Customer.js';
import { Order } from '@entities/orders/Order.js';
import { User } from '@entities/iam/User.js';
import { z } from 'zod';

const createTicketSchema = z.object({
    organizationId: z.string(),
    customerId: z.string().optional(),
    orderId: z.string().optional(),
    channel: z.enum(['email', 'sms', 'whatsapp', 'phone', 'chat', 'social_dm', 'web_form']),
    subject: z.string().min(1).max(500),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    category: z.enum(['order_inquiry', 'return', 'complaint', 'technical', 'billing', 'general', 'other']).default('general')
});

const updateTicketSchema = z.object({
    subject: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    category: z.enum(['order_inquiry', 'return', 'complaint', 'technical', 'billing', 'general', 'other']).optional(),
    status: z.enum(['new', 'open', 'pending_customer', 'pending_internal', 'resolved', 'closed', 'cancelled']).optional(),
    tags: z.string().max(500).optional()
});

const addMessageSchema = z.object({
    senderType: z.enum(['customer', 'agent', 'system']),
    senderId: z.string().optional(),
    senderName: z.string().optional(),
    senderEmail: z.string().optional(),
    message: z.string().min(1),
    isInternal: z.boolean().default(false),
    attachments: z.any().optional()
});

const assignTicketSchema = z.object({
    assignedTo: z.string(),
    notes: z.string().max(500).optional()
});

export class TicketsController {
    static async list(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(Ticket);
        const tickets = await repo.find({
            take: 100,
            relations: ['organization', 'customer', 'order', 'assignedTo'],
            order: { createdAt: 'DESC' }
        });
        res.json({ data: tickets });
    }

    static async get(req: Request, res: Response): Promise<void> {
        const repo = AppDataSource.getRepository(Ticket);
        const ticket = await repo.findOne({
            where: { id: req.params.id },
            relations: ['organization', 'customer', 'order', 'assignedTo', 'assignedBy', 'messages', 'messages.sender', 'assignments', 'assignments.assignedTo', 'assignments.assignedBy']
        });
        if (!ticket) {
            res.status(404).json({ error: { message: 'Ticket not found' } });
            return;
        }
        res.json({ data: ticket });
    }

    static async create(req: Request, res: Response): Promise<void> {
        const parsed = createTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
            return;
        }

        const orgRepo = AppDataSource.getRepository(Organization);
        const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
        if (!org) {
            res.status(400).json({ error: { message: 'Invalid organizationId' } });
            return;
        }

        let customer = null;
        if (parsed.data.customerId) {
            customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: parsed.data.customerId } });
        }

        let order = null;
        if (parsed.data.orderId) {
            order = await AppDataSource.getRepository(Order).findOne({ where: { id: parsed.data.orderId } });
        }

        const ticketRepo = AppDataSource.getRepository(Ticket);
        const ticketNumber = `TICK-${Date.now()}`; // Simple ticket number generation
        const ticket = ticketRepo.create({
            ...parsed.data,
            organization: org,
            customer,
            order,
            ticketNumber,
            status: 'new'
        });

        await ticketRepo.save(ticket);
        res.status(201).json({ data: ticket });
    }

    static async update(req: Request, res: Response): Promise<void> {
        const parsed = updateTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
            return;
        }

        const repo = AppDataSource.getRepository(Ticket);
        const ticket = await repo.findOne({ where: { id: req.params.id } });
        if (!ticket) {
            res.status(404).json({ error: { message: 'Ticket not found' } });
            return;
        }

        Object.assign(ticket, parsed.data);

        if (parsed.data.status === 'resolved' && !ticket.resolvedAt) {
            ticket.resolvedAt = new Date();
        }
        if (parsed.data.status === 'closed' && !ticket.closedAt) {
            ticket.closedAt = new Date();
        }

        await repo.save(ticket);
        res.json({ data: ticket });
    }

    static async addMessage(req: Request, res: Response): Promise<void> {
        const parsed = addMessageSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
            return;
        }

        const ticketRepo = AppDataSource.getRepository(Ticket);
        const ticket = await ticketRepo.findOne({ where: { id: req.params.id } });
        if (!ticket) {
            res.status(404).json({ error: { message: 'Ticket not found' } });
            return;
        }

        let sender = null;
        if (parsed.data.senderId) {
            sender = await AppDataSource.getRepository(User).findOne({ where: { id: parsed.data.senderId } });
        }

        const messageRepo = AppDataSource.getRepository(TicketMessage);
        const message = messageRepo.create({
            ...parsed.data,
            ticket,
            sender
        });

        await messageRepo.save(message);

        // Update ticket updated_at
        ticket.updatedAt = new Date();
        await ticketRepo.save(ticket);

        res.status(201).json({ data: message });
    }

    static async assign(req: Request, res: Response): Promise<void> {
        const parsed = assignTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
            return;
        }

        const ticketRepo = AppDataSource.getRepository(Ticket);
        const ticket = await ticketRepo.findOne({ where: { id: req.params.id } });
        if (!ticket) {
            res.status(404).json({ error: { message: 'Ticket not found' } });
            return;
        }

        const userRepo = AppDataSource.getRepository(User);
        const assignedTo = await userRepo.findOne({ where: { id: parsed.data.assignedTo } });
        if (!assignedTo) {
            res.status(400).json({ error: { message: 'Invalid assignedTo userId' } });
            return;
        }

        // Record assignment history
        const assignmentRepo = AppDataSource.getRepository(TicketAssignment);
        const assignment = assignmentRepo.create({
            ticket,
            assignedTo,
            notes: parsed.data.notes,
            assignedAt: new Date()
        });
        await assignmentRepo.save(assignment);

        // Update ticket
        ticket.assignedTo = assignedTo;
        ticket.assignedAt = new Date();
        if (ticket.status === 'new') {
            ticket.status = 'open';
        }
        await ticketRepo.save(ticket);

        res.json({ data: ticket });
    }
}
