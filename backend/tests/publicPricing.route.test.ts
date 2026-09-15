import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({getRate:vi.fn()}));
vi.mock('../src/billing/rates',()=>({getRate:mocks.getRate,quoteAmount:vi.fn()}));
import router from '../src/routes/billing';
import { HttpError } from '../src/lib/errors';
const app=express();
app.use('/billing',router);
app.use((error:HttpError,_req:Request,res:Response,_next:NextFunction)=>{res.status(error.status||500).json({error:error.message});});
describe('public pricing estimate data',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('returns only public pricing without requiring authentication',async()=>{
 const date=new Date('2026-09-15T12:00:00Z');
 mocks.getRate.mockResolvedValue({rate:'1234.50',sourceAt:date,fetchedAt:date});
 const response=await request(app).get('/billing/pricing');
 expect(response.status).toBe(200);
 expect(response.body).toEqual({data:{unitUsd:'0.10',freeAllowance:50,rate:'1234.50',sourceAt:date.toISOString(),fetchedAt:date.toISOString()}});
 expect(response.headers['cache-control']).toBe('public, max-age=60');
 });
 it('returns a retryable error when no usable rate exists',async()=>{
 mocks.getRate.mockRejectedValue(new HttpError(503,'Exchange rate unavailable. Please retry later.'));
 expect((await request(app).get('/billing/pricing')).status).toBe(503);
 });
 it('keeps billing balances behind authentication',async()=>{
 expect((await request(app).get('/billing/summary')).status).toBe(401);
 expect(mocks.getRate).not.toHaveBeenCalled();
 });
});
