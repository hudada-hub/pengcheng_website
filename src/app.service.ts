import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getTableData() {
    // TODO(stagewise): 这里是模拟数据，需要替换为真实数据源
    return [
      {
        id: 1,
        name: '张三',
        email: 'zhangsan@example.com',
        age: 25,
        department: '技术部',
      },
      {
        id: 2,
        name: '李四',
        email: 'lisi@example.com',
        age: 30,
        department: '市场部',
      },
      {
        id: 3,
        name: '王五',
        email: 'wangwu@example.com',
        age: 28,
        department: '人事部',
      },
      {
        id: 4,
        name: '赵六',
        email: 'zhaoliu@example.com',
        age: 32,
        department: '财务部',
      },
      {
        id: 5,
        name: '孙七',
        email: 'sunqi@example.com',
        age: 27,
        department: '技术部',
      },
    ];
  }
}
