# ប្រើ Node.js version 18
FROM node:18

# បង្កើត Folder សម្រាប់ដាក់កូដក្នុង Server
WORKDIR /app

# ចម្លង File package ទៅដំឡើង Library
COPY package*.json ./

# បញ្ជាឱ្យដំឡើង Library ទាំងអស់
RUN npm install

# ចម្លងកូដទាំងអស់ចូលក្នុង Server
COPY . .

# កំណត់ Port ឱ្យត្រូវជាមួយ Koyeb (Default 8000)
ENV PORT=3000
EXPOSE 3000

# បញ្ជាឱ្យ Start Server
CMD ["node", "index.js"]
