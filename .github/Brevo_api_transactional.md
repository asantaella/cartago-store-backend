***

title: Send a transactional email
subtitle: >-
Send transactional emails with static or dynamic content using the Messaging
API
slug: docs/send-a-transactional-email
-------------------------------------

Transactional emails are automated, non-promotional messages triggered by user actions such as account creation, order confirmations, and password resets.

<Note>
  If you're new to the API, see the [Quickstart guide](/docs/quickstart) before sending your first email.
</Note>

<CardGroup>
  <Card title="Static content" icon="fa-duotone fa-envelope-dot" href="#send-a-message-with-static-content">
    Send a basic message with a static body or predefined template.<br /><br />
  </Card>

  <Card title="Dynamic content" icon="fa-duotone fa-envelope-open-text" href="#send-a-message-with-dynamic-content">
    Send a message enriched with contact attributes or custom variables.<br /><br />
  </Card>
</CardGroup>

## Before you start

<Steps>
  <Step>
    ### Retrieve your credentials

    Get your API key or configure OAuth 2.0. See the [Authentication](/docs/authentication-schemes) guide for details.
  </Step>

  <Step>
    ### Register an email sender

    Configure your sending domain and sender before sending emails. See [how to set up your senders](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email) for instructions.

    <Frame caption="Set up a sender" background="subtle">
      <iframe src="https://www.youtube-nocookie.com/embed/yHLxBaiTrwY?rel=0&modestbranding=1&controls=0&showinfo=0&autohide=1" title="Embedded video" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen />
    </Frame>
  </Step>
</Steps>

## Send a message with static content

Send a simple email with static HTML or text content. Use this for straightforward transactional messages without <Tooltip tip="Dynamic variables can be contact attributes like name, lastname, address">dynamic variables</Tooltip> or advanced template logic.

**Example attributes:**

<AccordionGroup>
  <Accordion title="Subject line" defaultOpen={true}>
    <ParamField path="subject" type="string" required={true} deprecated={false} toc={false}>
      `Hello from Brevo!`
    </ParamField>
  </Accordion>

  <Accordion title="Sender details" defaultOpen={true}>
    <ParamField path="sender" type="object" required={true} deprecated={false} toc={false}>
      `{ "name" : "Alex from Brevo", "email" : "hello@brevo.com"}`
    </ParamField>
  </Accordion>

  <Accordion title="Recipient details" defaultOpen={true}>
    <ParamField path="to" type="object []" required={true} deprecated={false} toc={false}>
      `[{ "name" : "John Doe", "email" : "johndoe@example.com"}]`
    </ParamField>
  </Accordion>

  <Accordion title="Message body" defaultOpen={true}>
    <ParamField path="htmlContent" type="string" required={false} deprecated={false} toc={false}>
      "`<html><head></head><body><p>Hello,</p>this is my first transactional email sent from Brevo.</p></body></html>`"
    </ParamField>

    <ParamField path="textContent" type="string" required={false} deprecated={false} toc={false}>
      `Hello, this is my first transactional email sent from Brevo.`
    </ParamField>

    <ParamField path="templateId" type="string" required={false} deprecated={false} toc={false}>
      `345`
    </ParamField>
  </Accordion>
</AccordionGroup>

Use one of the following message body types:

* `htmlContent`: HTML content that defines the message structure and styling
* `textContent`: Plain text content for simple messages like password resets or order confirmations
* `templateId`: Reference a template created in the [Brevo Drag & Drop](https://my.brevo.com/camp/template/setup) editor by passing its template ID
  <Info> You can only pick one of the three different body types on each request.</Info>

### Request

<Tabs>
  <Tab title="HTML Body">
    ```curl
    curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
    "sender":{  
    "name":"Alex from Brevo",
    "email":"hello@brevo.com"
    },
    "to":[  
    {  
      "email":"johndoe@example.com",
      "name":"John Doe"
    }
    ],
    "subject":"Hello from Brevo!",
    "htmlContent":"<html><head></head><body><p>Hello,</p>This is my first transactional email sent from Brevo.</p></body></html>"
    }'
    ```
  </Tab>

  <Tab title="Text Body">
    ```curl
    curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
    "sender":{  
    "name":"Alex from Brevo",
    "email":"hello@brevo.com"
    },
    "to":[  
    {  
      "email":"johndoe@example.com",
      "name":"John Doe"
    }
    ],
    "subject":"Hello from Brevo!",
    "textContent":"Hello. This is my first transactional email sent from Brevo."
    }'
    ```
  </Tab>

  <Tab title="Template">
    ```curl
    curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
    "sender":{  
    "name":"Alex from Brevo",
    "email":"hello@brevo.com"
    },
    "to":[  
    {  
      "email":"johndoe@example.com",
      "name":"John Doe"
    }
    ],
    "subject":"Hello from Brevo!",
    "templateId":345
    }'
    ```
  </Tab>
</Tabs>

<RunnableEndpoint endpoint="POST /smtp/email" />

### Response

The response includes a `messageId` that you can use to [track deliverability events](https://app.brevo.com/transactional/email/logs) for this message.

<EndpointResponseSnippet endpoint="POST /smtp/email" />

## Send a message with dynamic content

Dynamic content lets you personalize message bodies with attributes that vary per request. You can embed variables in HTML content, plain text, or as templates.

This guide demonstrates dynamic content using an order confirmation email that includes:

* [Dynamic variables (tracking number, delivery date)](#dynamic-variables-embedded-in-the-request)
* Contact attributes (name, address)

### Dynamic variables embedded in the request

Pass <Tooltip tip="Dynamic variables can be contact attributes like name, lastname, address">dynamic variables</Tooltip> directly in your API request using the object `params` to personalize the message body. Variables are included in the request payload alongside the email content.

**Example attributes:**

<AccordionGroup>
  <Accordion title="Subject line" defaultOpen={true}>
    <ParamField path="subject" type="string" required={true} deprecated={false} toc={false}>
      `Hello from Brevo!`
    </ParamField>
  </Accordion>

  <Accordion title="Sender details" defaultOpen={true}>
    <ParamField path="sender" type="object" required={true} deprecated={false} toc={false}>
      `{ "name" : "Alex from Brevo", "email" : "hello@brevo.com"}`
    </ParamField>
  </Accordion>

  <Accordion title="Recipient details" defaultOpen={true}>
    <ParamField path="to" type="object []" required={true} deprecated={false} toc={false}>
      `[{ "name" : "John Doe", "email" : "johndoe@example.com"}]`
    </ParamField>
  </Accordion>

  <Accordion title="Dynamic variables" defaultOpen={true}>
    <ParamField path="params" type="object" required={false} deprecated={false} toc={false}>
      `{
              "trackingCode": "JD01460000300002350000",
              "estimatedArrival" : "Tomorrow"
           }`
    </ParamField>
  </Accordion>

  <Accordion title="Message body" defaultOpen={true}>
    <ParamField path="htmlContent" type="string" required={false} deprecated={false} toc={false}>
      `<html><head></head><body>Your delivery is expected {{params.estimatedArrival}}.Your tracking code: {{params.trackingCode}}</p></body></html>`
    </ParamField>

    <ParamField path="textContent" type="string" required={false} deprecated={false} toc={false}>
      `Your delivery is expected {{params.estimatedArrival}}.Your tracking code: {{params.trackingCode}}`
    </ParamField>
  </Accordion>
</AccordionGroup>

Use one of the following message body types:

* `htmlContent`: HTML content that defines the message structure and styling
* `textContent`: Plain text content for simple messages like password resets or order confirmations

<Info>
   You can only pick one of the two different body types on each request.
</Info>

### Request

<Tabs>
  <Tab title="HTML Body">
    ```curl
    curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
    "sender":{  
    "name":"Alex from Brevo",
    "email":"hello@brevo.com"
    },
    "to":[  
    {  
      "email":"johndoe@example.com",
      "name":"John Doe"
    }
    ],
    "subject":"Hello from Brevo!",
    "params": {
        "trackingCode": "JD01460000300002350000",
        "estimatedArrival" : "Tomorrow"
     },
    "htmlContent":"<html><head></head><body>Your delivery is expected {{params.estimatedArrival}}.Your tracking code: {{params.trackingCode}}</p></body></html>"
    }'
    ```
  </Tab>

  <Tab title="Text Body">
    ```curl
    curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
    "sender":{  
    "name":"Alex from Brevo",
    "email":"hello@brevo.com"
    },
    "to":[  
    {  
      "email":"johndoe@example.com",
      "name":"John Doe"
    }
    ],
    "subject":"Hello from Brevo!",
    "params": {
        "trackingCode": "JD01460000300002350000",
        "estimatedArrival" : "Tomorrow"
    },
    "textContent":"Your delivery is expected {{params.estimatedArrival}}.Your tracking code: {{params.trackingCode}}"
    }'
    ```
  </Tab>
</Tabs>

<RunnableEndpoint endpoint="POST /smtp/email" />

### Response

The response includes a `messageId` that you can use to [track deliverability events](https://app.brevo.com/transactional/email/logs) for this message.

<EndpointResponseSnippet endpoint="POST /smtp/email" />

## Create a template with dynamic content

Create the email template in the Brevo dashboard.

<Steps>
  ### Open template creation

  Open the template creation page in your Brevo dashboard.

  ### Configure settings

  Set up your template:

  * Template Name: "Order confirmation"
  * Subject Line: "Your new order has been received"
  * From Email: Select an existing sender
  * From Name: Enter your company name

  <Frame background="subtle">
    ![](https://files.readme.io/ba0362a-Screenshot_2023-07-07_at_13.19.59.png)
  </Frame>

  Click "Next Step".

  ### Import template

  In the Design tab, select "Import a template" and paste this URL:

  `https://my.brevo.com/iNF7GRiE34wzuyVRWobyyLLNbttWwwKn8CQLDhU7kui0HXu4tZG_ZzZ6Ng--`

  <Frame background="subtle">
    ![](https://files.readme.io/8e6f770-Screenshot_2023-07-07_at_13.33.08.png)
  </Frame>

  ### Save and activate

  Click "Import", then "Save & Quit". On the next page, click "Save and Activate".

  <Frame background="subtle">
    ![](https://files.readme.io/4cc05ac-Screenshot_2023-07-07_at_13.38.12.png)
  </Frame>

  ### Get template ID

  Return to the templates page and note the template ID (the number after "#" in the template name). You'll need this for API requests.

  <Frame background="subtle">
    ![](https://files.readme.io/4b603fe-Screenshot_2023-07-07_at_13.45.42.png)
  </Frame>
</Steps>

<Note>
  You can also create templates via the API using the [Create an SMTP template](/reference/create-smtp-template) endpoint. You can pass HTML content as a string (`htmlContent`) or via a URL (`htmlUrl`).
</Note>

## Add a delivery address attribute

Contacts include `EMAIL`, `FIRSTNAME`, `LASTNAME`, and `SMS` by default. Add a `DELIVERYADDRESS` attribute for use in the template.

<Steps>
  ### Create attribute

  Go to Contact > Settings > Contact Attributes & CRM and add a field named `DELIVERYADDRESS`.

  <Frame background="subtle">
    ![](https://files.readme.io/c22be3c-Screenshot_2023-07-07_at_13.48.25.png)
  </Frame>

  ### Add test contact

  Go to your [contacts page](https://my.sendinblue.com/users/list) and create a contact with:

  * **FIRSTNAME**: `John`
  * **LASTNAME**: `Doe`
  * **EMAIL**: Your email address
  * **DELIVERYADDRESS**: `75014 Paris, France`
  * **Contact list**: Select any list

  <Frame background="subtle">
    ![](https://files.readme.io/29dd4a2-Screenshot_2023-07-07_at_13.51.51.png)
  </Frame>

  Click "Save and Close".
</Steps>

<Note>
  Manage contacts via the API using [Create contact attribute](/api-reference/contact-management/attributes/create-attribute) and [Create a contact](/api-reference/contact-management/contacts/create-contact). For importing contacts, see [synchronize contact lists](/guides/marketing-platform/import-your-contacts-to-brevo).
</Note>

## Send the transactional email

Use the [Send a transactional email](/reference/send-transac-email) endpoint.

### Required parameters

* `sender`: Sender email and name (must be [registered and verified](https://account.sendinblue.com/senders))
  * `name` overrides your default sender name
* `to`: Recipient email and name
  * Email must be a Brevo contact assigned to a contact list
  * Contact must have `FIRSTNAME`, `LASTNAME`, `EMAIL`, and `DELIVERYADDRESS` attributes
  * `name` appears in email headers only
* `templateId`: Template ID from the [templates page](https://app-smtp.sendinblue.com/templates) or the [list templates endpoint](/reference/get-smtp-templates)
* `params`: Transactional parameters, e.g., `{"ORDER": 12345, "DATE": "12/06/2019"}`

### Test in API reference

Test the endpoint in the [API Reference](/reference/send-transac-email). Click "Try it" and enter your API key.

<Tip>
  The API reference interface doesn't support rich JSON body parameters like `params`. Use the code examples below for full functionality.
</Tip>

<Warning>
  The API reference makes real API calls. Check your [rate limits](/guides/api-rate-limits) and [credits](https://account.sendinblue.com/pricing) before testing.
</Warning>

### Code examples

<CodeBlocks>
  ```bash title="cURL - Using a template"
  curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
     "to":[  
        {  
           "email":"testmail@example.com",
           "name":"John Doe"
        }
     ],
     "templateId":8,
     "params":{  
        "name":"John",
        "surname":"Doe"
     },
     "headers":{  
        "X-Mailin-custom":"custom_header_1:custom_value_1|custom_header_2:custom_value_2|custom_header_3:custom_value_3",
        "charset":"iso-8859-1"
     }
  }'
  ```

  ```bash title="cURL - Using HTML content"
  curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key:YOUR_API_KEY' \
    --header 'content-type: application/json' \
    --data '{  
     "sender":{  
        "name":"Sender Alex",
        "email":"senderalex@example.com"
     },
     "to":[  
        {  
           "email":"testmail@example.com",
           "name":"John Doe"
        }
     ],
     "subject":"test mail",
     "htmlContent":"<html><head></head><body><h1>Hello this is a test email from sib</h1></body></html>",
     "headers":{  
        "X-Mailin-custom":"custom_header_1:custom_value_1|custom_header_2:custom_value_2|custom_header_3:custom_value_3",
        "charset":"iso-8859-1"
     }
  }'
  ```
</CodeBlocks>

<Tip>
  Include these headers in each request:

  * `api-key: xkeysib-xxxxxxxxxxxxxxxxx`
  * `content-type: application/json`
  * `accept: application/json`
</Tip>

Check your inbox for the email.

## Track email events with webhooks

Set up webhooks to track email status. Available events:

**Sent, Delivered, Opened, Clicked, Soft Bounce, Hard Bounce, Invalid Email, Deferred, Complaint, Unsubscribed, Blocked, Error**

<Steps>
  ### Create webhook

  Go to the [transactional webhooks page](https://app-smtp.sendinblue.com/webhook#modal-add-webhook) and:

  * Enter your server URL to receive webhook events
  * Select events to track

  <Frame background="subtle">
    ![transactional webhooks page](https://files.buildwithfern.com/brevo.docs.buildwithfern.com/ea21ab98c091c29df55446bb82371199dd1c299d8488676137e2bb3e90774e52/docs/assets/images/2d8bbf5-Screenshot_2023-07-11_at_12.50.50.png)
  </Frame>

  <Note>
    Manage webhooks via the API using [Create a webhook](/api-reference/accounts-and-settings/webhooks/create-webhook) and [Update a webhook](/api-reference/accounts-and-settings/webhooks/update-webhook).
  </Note>

  ### Send test email with tags

  After selecting the `delivered` event (or any other event), send a test email. Brevo POSTs event data to your URL when the event occurs.

  Add `tags` to identify events in your system:

  ```bash
  curl --request POST \
    --url https://api.brevo.com/v3/smtp/email \
    --header 'accept: application/json' \
    --header 'api-key: xkeysib-xxxxxxxxxxx' \
    --header 'content-type: application/json' \
    --data '{
    "sender":{"email":"sender@example.com"},
    "to":[{"email":"recipient@example.com"}],
    "replyTo":{"email":"sender@example.com"},
    "textContent":"This is a transactional email",
    "subject":"Subject Line",
    "tags":["myFirstTransactional"]
    }'
  ```

  ### Review webhook payload

  When your email is delivered, Brevo POSTs this payload to your webhook URL:

  ```json
  {
    "event": "delivered",
    "email": "example@example.com",
    "id": 26224,
    "date": "YYYY-MM-DD HH:mm:ss",
    "ts": 1598634509,
    "message-id": "<xxxxxxxxxxxx.xxxxxxxxx@domain.com>",
    "ts_event": 1598034509,
    "subject": "Subject Line",
    "tag": "[\"transactionalTag\"]",
    "sending_ip": "185.41.28.109",
    "ts_epoch": 1598634509223,
    "tags": [
      "myFirstTransactional"
    ]
  }
  ```

  The payload structure is consistent for all events of the same type.
</Steps>

See all event payload structures in the [webhook responses documentation](https://help.sendinblue.com/hc/en-us/articles/360007666479-Webhook-Responses-Email-Campaigns-Contacts).