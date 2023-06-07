export class Error {
    private msg: string;

    constructor(msg: string) {
      this.msg = msg;
    }
} 

export type ErrorMap = {
    [key: string]: Error
}
