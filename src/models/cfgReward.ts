export interface IReward {
    type: 'gold' | 'diamond' | 'seya' | 'lucky_chest' | 'dragon_chest' | 'dragon_ball' | 'onchain_sei' | 'sei';
    level?: number;
    quantity: number;
}
