// declare type VaitReturn<T extends unknown, ErrorType = Error> = Promise<T> & {
//     __isVait__: true;
//     __finally__: boolean;
//     __value__: T;
//     __error__?: ErrorType;
//     pass(val: T): void;
//     fail(err: Error): void;
// };
// declare type TimeoutReturn<T extends unknown> = VaitReturn<T, Error> & {
//     clear(): void;
// };
// interface IVait {
//     <T extends unknown, ErrorType>(): VaitReturn<T, ErrorType>;
//     timeout<T extends unknown>(timing: string | number, value?: T): TimeoutReturn<T>;
//     nextTick(): TimeoutReturn<undefined>;
//     wait<T extends unknown>(promise: Promise<T>): VaitReturn<T>;
// }
// declare const Vait: IVait;
// export default Vait;
