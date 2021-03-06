/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noflow
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import dedent from '../../jsutils/dedent';
import { buildClientSchema } from '../buildClientSchema';
import { introspectionFromSchema } from '../introspectionFromSchema';
import {
  buildSchema,
  printSchema,
  graphqlSync,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLInt,
  GraphQLFloat,
  GraphQLString,
  GraphQLBoolean,
  GraphQLID,
} from '../../';

/**
 * This function does a full cycle of going from a string with the contents of
 * the SDL, build in-memory GraphQLSchema from it, produce a client-side
 * representation of the schema by using "buildClientSchema"and then finally
 * printing that that schema into the SDL
 */
function cycleIntrospection(sdlString) {
  const serverSchema = buildSchema(sdlString);
  const initialIntrospection = introspectionFromSchema(serverSchema);
  const clientSchema = buildClientSchema(initialIntrospection);

  /**
   * If the client then runs the introspection query against the client-side
   * schema, it should get a result identical to what was returned by the server
   */
  const secondIntrospection = introspectionFromSchema(clientSchema);
  expect(secondIntrospection).to.deep.equal(initialIntrospection);

  return printSchema(clientSchema);
}

describe('Type System: build schema from introspection', () => {
  it('builds a simple schema', () => {
    const sdl = dedent`
      schema {
        query: Simple
      }

      """This is simple type"""
      type Simple {
        """This is a string field"""
        string: String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a simple schema with all operation types', () => {
    const sdl = dedent`
      schema {
        query: QueryType
        mutation: MutationType
        subscription: SubscriptionType
      }

      """This is a simple mutation type"""
      type MutationType {
        """Set the string field"""
        string: String
      }

      """This is a simple query type"""
      type QueryType {
        """This is a string field"""
        string: String
      }

      """This is a simple subscription type"""
      type SubscriptionType {
        """This is a string field"""
        string: String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('uses built-in scalars when possible', () => {
    const sdl = dedent`
      scalar CustomScalar

      type Query {
        int: Int
        float: Float
        string: String
        boolean: Boolean
        id: ID
        custom: CustomScalar
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);

    const schema = buildSchema(sdl);
    const introspection = introspectionFromSchema(schema);
    const clientSchema = buildClientSchema(introspection);

    // Built-ins are used
    expect(clientSchema.getType('Int')).to.equal(GraphQLInt);
    expect(clientSchema.getType('Float')).to.equal(GraphQLFloat);
    expect(clientSchema.getType('String')).to.equal(GraphQLString);
    expect(clientSchema.getType('Boolean')).to.equal(GraphQLBoolean);
    expect(clientSchema.getType('ID')).to.equal(GraphQLID);

    // Custom are built
    const customScalar = schema.getType('CustomScalar');
    expect(clientSchema.getType('CustomScalar')).not.to.equal(customScalar);
  });

  it('builds a schema with a recursive type reference', () => {
    const sdl = dedent`
      schema {
        query: Recur
      }

      type Recur {
        recur: Recur
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with a circular type reference', () => {
    const sdl = dedent`
      type Dog {
        bestFriend: Human
      }

      type Human {
        bestFriend: Dog
      }

      type Query {
        dog: Dog
        human: Human
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with an interface', () => {
    const sdl = dedent`
      type Dog implements Friendly {
        bestFriend: Friendly
      }

      interface Friendly {
        """The best friend of this friendly thing"""
        bestFriend: Friendly
      }

      type Human implements Friendly {
        bestFriend: Friendly
      }

      type Query {
        friendly: Friendly
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with an implicit interface', () => {
    const sdl = dedent`
      type Dog implements Friendly {
        bestFriend: Friendly
      }

      interface Friendly {
        """The best friend of this friendly thing"""
        bestFriend: Friendly
      }

      type Query {
        dog: Dog
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with a union', () => {
    const sdl = dedent`
      type Dog {
        bestFriend: Friendly
      }

      union Friendly = Dog | Human

      type Human {
        bestFriend: Friendly
      }

      type Query {
        friendly: Friendly
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with complex field values', () => {
    const sdl = dedent`
      type Query {
        string: String
        listOfString: [String]
        nonNullString: String!
        nonNullListOfString: [String]!
        nonNullListOfNonNullString: [String!]!
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with field arguments', () => {
    const sdl = dedent`
      type Query {
        """A field with a single arg"""
        one(
          """This is an int arg"""
          intArg: Int
        ): String

        """A field with a two args"""
        two(
          """This is an list of int arg"""
          listArg: [Int]

          """This is a required arg"""
          requiredArg: Boolean!
        ): String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with default value on custom scalar field', () => {
    const sdl = dedent`
      scalar CustomScalar

      type Query {
        testField(testArg: CustomScalar = "default"): String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with an enum', () => {
    const foodEnum = new GraphQLEnumType({
      name: 'Food',
      description: 'Varieties of food stuffs',
      values: {
        VEGETABLES: {
          description: 'Foods that are vegetables.',
          value: 1,
        },
        FRUITS: {
          description: 'Foods that are fruits.',
          value: 2,
        },
        OILS: {
          description: 'Foods that are oils.',
          value: 3,
        },
        DAIRY: {
          description: 'Foods that are dairy.',
          value: 4,
        },
        MEAT: {
          description: 'Foods that are meat.',
          value: 5,
        },
      },
    });
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'EnumFields',
        fields: {
          food: {
            description: 'Repeats the arg you give it',
            type: foodEnum,
            args: {
              kind: {
                description: 'what kind of food?',
                type: foodEnum,
              },
            },
          },
        },
      }),
    });

    const introspection = introspectionFromSchema(schema);
    const clientSchema = buildClientSchema(introspection);
    const secondIntrospection = introspectionFromSchema(clientSchema);
    expect(secondIntrospection).to.deep.equal(introspection);

    const clientFoodEnum = clientSchema.getType('Food');

    // It's also an Enum type on the client.
    expect(clientFoodEnum).to.be.an.instanceOf(GraphQLEnumType);

    // Client types do not get server-only values, so `value` mirrors `name`,
    // rather than using the integers defined in the "server" schema.
    expect(clientFoodEnum.getValues()).to.deep.equal([
      {
        name: 'VEGETABLES',
        value: 'VEGETABLES',
        description: 'Foods that are vegetables.',
        isDeprecated: false,
        deprecationReason: null,
        astNode: undefined,
      },
      {
        name: 'FRUITS',
        value: 'FRUITS',
        description: 'Foods that are fruits.',
        isDeprecated: false,
        deprecationReason: null,
        astNode: undefined,
      },
      {
        name: 'OILS',
        value: 'OILS',
        description: 'Foods that are oils.',
        isDeprecated: false,
        deprecationReason: null,
        astNode: undefined,
      },
      {
        name: 'DAIRY',
        value: 'DAIRY',
        description: 'Foods that are dairy.',
        isDeprecated: false,
        deprecationReason: null,
        astNode: undefined,
      },
      {
        name: 'MEAT',
        value: 'MEAT',
        description: 'Foods that are meat.',
        isDeprecated: false,
        deprecationReason: null,
        astNode: undefined,
      },
    ]);
  });

  it('builds a schema with an input object', () => {
    const sdl = dedent`
      """An input address"""
      input Address {
        """What street is this address?"""
        street: String!

        """The city the address is within?"""
        city: String!

        """The country (blank will assume USA)."""
        country: String = "USA"
      }

      type Query {
        """Get a geocode from an address"""
        geocode(
          """The address to lookup"""
          address: Address
        ): String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with field arguments with default values', () => {
    const sdl = dedent`
      input Geo {
        lat: Float
        lon: Float
      }

      type Query {
        defaultInt(intArg: Int = 30): String
        defaultList(listArg: [Int] = [1, 2, 3]): String
        defaultObject(objArg: Geo = {lat: 37.485, lon: -122.148}): String
        defaultNull(intArg: Int = null): String
        noDefault(intArg: Int): String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with custom directives', () => {
    const sdl = dedent`
      """This is a custom directive"""
      directive @customDirective on FIELD

      type Query {
        string: String
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('builds a schema with legacy names', () => {
    const introspection = {
      __schema: {
        queryType: {
          name: 'Query',
        },
        types: [
          {
            name: 'Query',
            kind: 'OBJECT',
            fields: [
              {
                name: '__badName',
                args: [],
                type: { name: 'String' },
              },
            ],
            interfaces: [],
          },
        ],
      },
    };
    const schema = buildClientSchema(introspection, {
      allowedLegacyNames: ['__badName'],
    });
    expect(schema.__allowedLegacyNames).to.deep.equal(['__badName']);
  });

  it('builds a schema aware of deprecation', () => {
    const sdl = dedent`
      enum Color {
        """So rosy"""
        RED

        """So grassy"""
        GREEN

        """So calming"""
        BLUE

        """So sickening"""
        MAUVE @deprecated(reason: "No longer in fashion")
      }

      type Query {
        """This is a shiny string field"""
        shinyString: String

        """This is a deprecated string field"""
        deprecatedString: String @deprecated(reason: "Use shinyString")
        color: Color
      }
    `;

    expect(cycleIntrospection(sdl)).to.equal(sdl);
  });

  it('can use client schema for limited execution', () => {
    const schema = buildSchema(`
      scalar CustomScalar

      type Query {
        foo(custom1: CustomScalar, custom2: CustomScalar): String
      }
    `);

    const introspection = introspectionFromSchema(schema);
    const clientSchema = buildClientSchema(introspection);

    const result = graphqlSync(
      clientSchema,
      'query Limited($v: CustomScalar) { foo(custom1: 123, custom2: $v) }',
      { foo: 'bar', unused: 'value' },
      null,
      { v: 'baz' },
    );

    expect(result.data).to.deep.equal({ foo: 'bar' });
  });

  describe('throws when given incomplete introspection', () => {
    it('throws when given empty types', () => {
      const incompleteIntrospection = {
        __schema: {
          queryType: { name: 'QueryType' },
          types: [],
        },
      };

      expect(() => buildClientSchema(incompleteIntrospection)).to.throw(
        'Invalid or incomplete schema, unknown type: QueryType. Ensure ' +
          'that a full introspection query is used in order to build a ' +
          'client schema.',
      );
    });

    it('throws when missing kind', () => {
      const incompleteIntrospection = {
        __schema: {
          queryType: { name: 'QueryType' },
          types: [{ name: 'QueryType' }],
        },
      };

      expect(() => buildClientSchema(incompleteIntrospection)).to.throw(
        'Invalid or incomplete introspection result. Ensure that a full ' +
          'introspection query is used in order to build a client schema',
      );
    });

    it('throws when missing interfaces', () => {
      const nullInterfaceIntrospection = {
        __schema: {
          queryType: { name: 'QueryType' },
          types: [
            {
              kind: 'OBJECT',
              name: 'QueryType',
              fields: [
                {
                  name: 'aString',
                  args: [],
                  type: { kind: 'SCALAR', name: 'String', ofType: null },
                  isDeprecated: false,
                },
              ],
            },
          ],
        },
      };

      expect(() => buildClientSchema(nullInterfaceIntrospection)).to.throw(
        'Introspection result missing interfaces: ' +
          '{ kind: "OBJECT", name: "QueryType", fields: [{ name: "aString", args: [], type: { kind: "SCALAR", name: "String", ofType: null }, isDeprecated: false }] }',
      );
    });

    it('throws when missing directive locations', () => {
      const introspection = {
        __schema: {
          types: [],
          directives: [{ name: 'test', args: [] }],
        },
      };

      expect(() => buildClientSchema(introspection)).to.throw(
        'Introspection result missing directive locations: ' +
          '{ name: "test", args: [] }',
      );
    });
  });

  describe('very deep decorators are not supported', () => {
    it('fails on very deep (> 7 levels) lists', () => {
      const schema = buildSchema(`
        type Query {
          foo: [[[[[[[[String]]]]]]]]
        }
      `);

      const introspection = introspectionFromSchema(schema);
      expect(() => buildClientSchema(introspection)).to.throw(
        'Decorated type deeper than introspection query.',
      );
    });

    it('fails on a very deep (> 7 levels) non-null', () => {
      const schema = buildSchema(`
        type Query {
          foo: [[[[String!]!]!]!]
        }
      `);

      const introspection = introspectionFromSchema(schema);
      expect(() => buildClientSchema(introspection)).to.throw(
        'Decorated type deeper than introspection query.',
      );
    });

    it('succeeds on deep (<= 7 levels) types', () => {
      // e.g., fully non-null 3D matrix
      const sdl = dedent`
        type Query {
          foo: [[[String!]!]!]!
        }
      `;

      expect(cycleIntrospection(sdl)).to.equal(sdl);
    });
  });

  describe('prevents infinite recursion on invalid introspection', () => {
    it('recursive interfaces', () => {
      const introspection = {
        __schema: {
          types: [
            {
              name: 'Foo',
              kind: 'OBJECT',
              fields: [],
              interfaces: [{ name: 'Foo' }],
            },
          ],
        },
      };
      expect(() => buildClientSchema(introspection)).to.throw(
        'Expected Foo to be a GraphQL Interface type.',
      );
    });

    it('recursive union', () => {
      const introspection = {
        __schema: {
          types: [
            {
              name: 'Foo',
              kind: 'UNION',
              possibleTypes: [{ name: 'Foo' }],
            },
          ],
        },
      };
      expect(() => buildClientSchema(introspection)).to.throw(
        'Expected Foo to be a GraphQL Object type.',
      );
    });
  });
});
